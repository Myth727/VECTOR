"""
VECTOR Frontier Tracker
=======================
Displays and manages the frontier — best known VECTOR config per preset.
Adapted from frontier_val.json pattern in Meta-Harness (Lee et al. 2026).

Usage:
    python tools/frontier.py --show
    python tools/frontier.py --reset
    python tools/frontier.py --compare DEFAULT TECHNICAL
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

LOGS_DIR  = Path("tools/logs")
FRONTIER  = LOGS_DIR / "frontier_val.json"
EVOLUTION = LOGS_DIR / "evolution_summary.jsonl"


def load_frontier() -> dict:
    return json.loads(FRONTIER.read_text()) if FRONTIER.exists() else {}


def load_evolution() -> list:
    if not EVOLUTION.exists():
        return []
    lines = []
    for line in EVOLUTION.read_text().splitlines():
        try:
            lines.append(json.loads(line))
        except Exception:
            pass
    return lines


def color(code, text):
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text


def show_frontier():
    f = load_frontier()
    if not f:
        print("No frontier data yet. Run meta_loop.py first.")
        return

    best = f.pop("_best", None)
    print("\n" + "="*60)
    print("VECTOR FRONTIER — Best config per preset")
    print("Ref: Lee et al. (2026) arXiv:2603.28052")
    print("="*60)

    rows = sorted(f.items(), key=lambda x: x[1].get("avg_c", 0), reverse=True)
    for preset, data in rows:
        avg_c   = data.get("avg_c", 0)
        modules = data.get("modules", [])
        ts      = data.get("timestamp", "")[:10]
        bar     = "█" * int(avg_c * 20)
        c       = "32" if avg_c >= 0.75 else "33" if avg_c >= 0.60 else "31"
        print(f"  {color(c, f'{preset:<12}')} avg_c={color(c, f'{avg_c:.4f}')} "
              f"[{bar:<20}] modules={modules or 'none'} ({ts})")

    if best:
        print(f"\n  {'BEST OVERALL':<12} avg_c={best.get('avg_c',0):.4f} "
              f"modules={best.get('modules', 'none')}")

    # Evolution stats
    history = load_evolution()
    if history:
        total    = len(history)
        improved = sum(1 for h in history if h.get("delta", 0) > 0)
        print(f"\n  Iterations: {total} | Improved: {improved} | "
              f"Win rate: {improved/total:.0%}")

        # Axis frequency
        axes = {}
        for h in history:
            ax = h.get("axis", "?")
            axes[ax] = axes.get(ax, 0) + 1
        axis_str = " ".join(f"{k}={v}" for k, v in sorted(axes.items()))
        print(f"  Axis distribution: {axis_str}")

    print()


def compare_presets(presets: list):
    f = load_frontier()
    if not f:
        print("No frontier data.")
        return

    print(f"\nComparing: {', '.join(presets)}")
    print("-" * 50)
    for p in presets:
        data = f.get(p, {})
        if data:
            avg_c   = data.get("avg_c", 0)
            modules = data.get("modules", [])
            c       = "32" if avg_c >= 0.75 else "33" if avg_c >= 0.60 else "31"
            print(f"  {p:<12} avg_c={color(c, f'{avg_c:.4f}')} modules={modules or 'none'}")
        else:
            print(f"  {p:<12} not yet evaluated")


def show_evolution_report():
    history = load_evolution()
    if not history:
        print("No evolution history yet.")
        return

    print("\n" + "="*60)
    print("VECTOR EVOLUTION REPORT")
    print("="*60)

    for h in history[-10:]:
        delta = h.get("delta", 0)
        sign  = "+" if delta >= 0 else ""
        c     = "32" if delta > 0.01 else "31" if delta < -0.01 else "33"
        print(f"  iter={h.get('iteration',?):>2} "
              f"preset={h.get('preset','?'):<12} "
              f"avg_c={h.get('avg_c',0):.3f} "
              f"delta={color(c, f'{sign}{delta:.3f}')} "
              f"axis={h.get('axis','?')} "
              f"type={h.get('type','?')[:4]}")
        if h.get("hypothesis"):
            print(f"       hyp: {h['hypothesis'][:80]}")


def main():
    parser = argparse.ArgumentParser(description="VECTOR Frontier Tracker")
    parser.add_argument("--show",    action="store_true", help="Show frontier")
    parser.add_argument("--report",  action="store_true", help="Show evolution report")
    parser.add_argument("--compare", nargs="+",           help="Compare specific presets")
    parser.add_argument("--reset",   action="store_true", help="Clear frontier and history")
    args = parser.parse_args()

    if args.reset:
        for f in [FRONTIER, EVOLUTION]:
            if f.exists():
                f.unlink()
                print(f"Cleared {f}")
        return

    if args.compare:
        compare_presets(args.compare)
    elif args.report:
        show_evolution_report()
    else:
        show_frontier()
        if not args.show:
            show_evolution_report()


if __name__ == "__main__":
    main()
