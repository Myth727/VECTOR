"""
VECTOR Meta-Evolution Loop
==========================
Autonomous search over VECTOR harness configurations.
Proposes 3 candidates per iteration, scores each, tracks the frontier.

Directly adapted from Meta-Harness (Lee et al. 2026, arXiv:2603.28052).
The evolution loop, frontier tracking, and candidate proposal schema are
their patterns applied to VECTOR's configuration space.

Usage:
    python tools/meta_loop.py --transcript session.json --iterations 5
    python tools/meta_loop.py --transcript session.json --iterations 10 --fresh
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("pip install anthropic", file=sys.stderr)
    sys.exit(1)

from vector_harness import score_transcript, PRESETS

LOGS_DIR    = Path("tools/logs")
FRONTIER    = LOGS_DIR / "frontier_val.json"
EVOLUTION   = LOGS_DIR / "evolution_summary.jsonl"


def _ts():
    return datetime.now().strftime("[%H:%M:%S]")

def _color(code, text):
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text

def green(t):  return _color("32", t)
def red(t):    return _color("31", t)
def yellow(t): return _color("33", t)
def dim(t):    return _color("2", t)


def load_frontier() -> dict:
    return json.loads(FRONTIER.read_text()) if FRONTIER.exists() else {}


def save_frontier(f: dict):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTIER.write_text(json.dumps(f, indent=2))


def update_frontier(frontier: dict, preset: str, avg_c: float, modules: list) -> dict:
    """Keep best avg_c per preset — adapted from Meta-Harness frontier_val.json."""
    current = frontier.get(preset, {}).get("avg_c", -1)
    if avg_c > current:
        frontier[preset] = {
            "avg_c": avg_c,
            "modules": modules,
            "timestamp": datetime.now().isoformat(),
        }
        best = max(frontier.values(), key=lambda x: x.get("avg_c", 0))
        frontier["_best"] = best
    return frontier


def log_evolution(entry: dict):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(EVOLUTION, "a") as f:
        f.write(json.dumps(entry) + "\n")


def load_evolution_history() -> list:
    if not EVOLUTION.exists():
        return []
    lines = []
    for line in EVOLUTION.read_text().splitlines():
        try:
            lines.append(json.loads(line))
        except Exception:
            pass
    return lines


def build_proposer_prompt(transcript_summary: dict, history: list,
                           frontier: dict, iteration: int) -> str:
    """
    Build the proposer prompt for this evolution iteration.
    Schema and anti-parameter-tuning rules adapted from Meta-Harness SKILL.md.
    """
    best = frontier.get("_best", {})
    hist_str = ""
    if history:
        hist_str = "\n\nEVOLUTION HISTORY (avoid repeating same axis 3+ times):\n"
        for h in history[-5:]:
            delta_str = (f"+{h['delta']:.3f}" if h.get('delta', 0) >= 0
                        else f"{h.get('delta',0):.3f}")
            hist_str += (f"iter={h.get('iteration',?)} preset={h.get('preset',?)} "
                        f"avg_c={h.get('avg_c',0):.3f} delta={delta_str} "
                        f"axis={h.get('axis','?')} outcome={h.get('outcome','?')}\n")

    return f"""You are analyzing a VECTOR session to propose harness configuration improvements.

VECTOR is a volatility-sensitive correction engine. You are searching for the optimal
harness configuration — the preset and module settings that maximize coherence (C-score)
and minimize drift events.

RULES (from Meta-Harness anti-parameter-tuning, Lee et al. 2026 arXiv:2603.28052):
1. Propose EXACTLY 3 candidates.
2. Each must change a FUNDAMENTAL MECHANISM, not just tune numbers.
3. Parameter-only changes almost always regress or tie. AVOID THEM.
4. Mix exploitation (refine what works) and exploration (try different approach).
5. Hypotheses must be FALSIFIABLE.
6. Exploitation axes: A=Preset B=Thresholds C=InjectionMode D=SignalSensitivity E=NoiseModel F=KalmanVariant

GOOD mechanism changes:
- Switch preset (DEFAULT→TECHNICAL, CREATIVE→RESEARCH)
- Enable EKF or Particle Filter instead of standard Kalman
- Enable Lévy noise instead of Langevin
- Change to CIR or Heston SDE model
- Adjust harness mode strategy (start at MODERATE instead of AUDIT)

BAD candidates (parameter variants — avoid):
- Change varCaution from 0.120 to 0.115
- Adjust GARCH omega by 0.001

SESSION RESULTS:
- Current preset: {transcript_summary.get('preset')}
- Turns: {transcript_summary.get('turns')}
- Avg C-score: {transcript_summary.get('avg_c')}
- Drift events: {transcript_summary.get('drift_events')}
- Health: {transcript_summary.get('health')}
- Variance state: {transcript_summary.get('final_variance_state')}

CURRENT FRONTIER (best known):
{json.dumps(best, indent=2) if best else "No frontier yet — first iteration."}
{hist_str}

Return ONLY valid JSON:
{{
  "iteration": {iteration},
  "summary": "<2 sentences: what went wrong and the opportunity>",
  "candidates": [
    {{
      "name": "<snake_case>",
      "preset": "<DEFAULT|TECHNICAL|CREATIVE|RESEARCH|MEDICAL|CIRCUIT>",
      "hypothesis": "<falsifiable claim>",
      "axis": "<A|B|C|D|E|F>",
      "type": "<exploitation|exploration>",
      "mechanism_change": "<what fundamentally changes>",
      "enable_modules": ["<ekf|particle|levy|cir|heston|vasicek|sabr>"],
      "predicted_delta": 0.0,
      "priority": "<high|medium|low>"
    }}
  ],
  "frontier_note": "<observation about best known config>"
}}"""


def propose(transcript_summary: dict, history: list, frontier: dict,
            iteration: int, client: anthropic.Anthropic) -> dict:
    """Call Claude to propose 3 candidates — Meta-Harness propose_claude pattern."""
    print(f"{_ts()} {dim('Proposing candidates...')}")
    prompt = build_proposer_prompt(transcript_summary, history, frontier, iteration)
    try:
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1200,
            system="Return only valid JSON. No markdown, no backticks, no preamble.",
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        raw = re.sub(r"```json|```", "", raw).strip()
        return json.loads(raw)
    except Exception as e:
        print(f"  {red('Proposer failed:')} {e}")
        return {"candidates": [], "summary": str(e)}


def run_evolution(args):
    """
    Main evolution loop — adapted from meta_harness.py run_evolve().
    Iterate: score → propose → score candidates → update frontier → repeat.
    """
    import re  # needed inside this scope

    transcript = json.loads(Path(args.transcript).read_text())
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

    if args.fresh and EVOLUTION.exists():
        EVOLUTION.unlink()
        print("Fresh start: cleared evolution history")

    print(f"\n{'='*60}")
    print(f"VECTOR Meta-Evolution Loop")
    print(f"Reference: Lee et al. (2026) arXiv:2603.28052")
    print(f"Transcript: {args.transcript} | Iterations: {args.iterations}")
    print(f"{'='*60}\n")

    frontier = load_frontier()
    history  = load_evolution_history()
    best_avg = frontier.get("_best", {}).get("avg_c", 0)

    # Score baseline
    print(f"{_ts()} Scoring baseline ({args.preset})...")
    baseline = score_transcript(transcript, args.preset)
    print(f"  Baseline avg_c={baseline['avg_c']} drifts={baseline['drift_events']} "
          f"health={baseline['health']}")
    frontier = update_frontier(frontier, args.preset, baseline["avg_c"], [])
    save_frontier(frontier)

    for iteration in range(1, args.iterations + 1):
        print(f"\n{dim('─'*60)}")
        print(f"{_ts()} {yellow(f'Iteration {iteration}/{args.iterations}')}")

        start = time.time()
        proposal = propose(baseline, history, frontier, iteration, client)
        propose_time = time.time() - start

        if not proposal.get("candidates"):
            print(f"  {red('No candidates returned')}")
            continue

        print(f"  {dim('Summary:')} {proposal.get('summary','')}")
        print(f"  {dim('Candidates:')} {', '.join(c.get('name','?') for c in proposal['candidates'])}")

        # Score each candidate
        results = {}
        for c in proposal["candidates"]:
            preset = c.get("preset", "DEFAULT")
            name   = c.get("name", f"candidate_{iteration}")
            print(f"  {dim('Scoring')} {name} ({preset})...", end=" ", flush=True)
            res = score_transcript(transcript, preset)
            results[name] = res
            delta = res["avg_c"] - baseline["avg_c"]
            status = green(f"+{delta:.3f}") if delta > 0 else red(f"{delta:.3f}")
            print(f"avg_c={res['avg_c']} {status}")

            # Log to evolution summary
            entry = {
                "iteration": iteration,
                "system": name,
                "preset": preset,
                "avg_c": res["avg_c"],
                "avg_val": round(res["avg_c"] * 100, 1),
                "delta": round(delta, 4),
                "axis": c.get("axis", "B"),
                "hypothesis": c.get("hypothesis", ""),
                "outcome": f"{res['avg_c']:.3f} ({delta:+.3f})",
                "type": c.get("type", "exploitation"),
                "components": c.get("enable_modules", []),
                "mechanism": c.get("mechanism_change", ""),
            }
            log_evolution(entry)
            history.append(entry)
            frontier = update_frontier(frontier, preset, res["avg_c"],
                                       c.get("enable_modules", []))

        save_frontier(frontier)

        # Update baseline to best result this iteration
        best_this = max(results.items(), key=lambda x: x[1]["avg_c"])
        if best_this[1]["avg_c"] > best_avg:
            best_avg = best_this[1]["avg_c"]
            baseline = best_this[1]
            print(f"  {green('NEW BEST')} {best_this[0]}: avg_c={best_avg}")
        else:
            print(f"  {dim('No improvement')} (best={best_avg:.3f})")

        elapsed = time.time() - start
        print(f"  {dim(f'Iteration done in {elapsed:.1f}s')}")

    print(f"\n{'='*60}")
    print(f"Evolution complete. Best avg_c: {best_avg:.4f}")
    best = frontier.get("_best", {})
    if best:
        print(f"Best config: {json.dumps(best, indent=2)}")
    print(f"Evolution log: {EVOLUTION}")
    print(f"Frontier: {FRONTIER}")


def main():
    import re

    parser = argparse.ArgumentParser(description="VECTOR Meta-Evolution Loop")
    parser.add_argument("--transcript", required=True)
    parser.add_argument("--preset",     default="DEFAULT", choices=list(PRESETS))
    parser.add_argument("--iterations", default=5, type=int)
    parser.add_argument("--fresh",      action="store_true", help="Clear evolution history")
    args = parser.parse_args()

    if not Path(args.transcript).exists():
        print(f"Transcript not found: {args.transcript}", file=sys.stderr)
        sys.exit(1)

    run_evolution(args)


if __name__ == "__main__":
    import re
    main()
