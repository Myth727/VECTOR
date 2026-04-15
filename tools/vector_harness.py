"""
VECTOR Offline Harness
======================
Runs VECTOR coherence scoring against a transcript without a browser.
Outputs per-turn C-scores, Kalman estimates, GARCH variance, and signals.

Adapted from Meta-Harness (Lee et al. 2026, arXiv:2603.28052).
The harness interface pattern — score, analyze, propose — is theirs.

Usage:
    python tools/vector_harness.py --transcript session.json
    python tools/vector_harness.py --transcript session.json --preset TECHNICAL
    python tools/vector_harness.py --transcript session.json --output results.json
"""

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


# ── Constants (mirrored from VECTOR.jsx) ─────────────────────────────────────
KAPPA        = 0.444
DAMPING      = 1 / (1 + KAPPA)
EPSILON      = 0.05
KALMAN_R     = 0.015
KALMAN_SIGMA_P = 0.06
GARCH_OMEGA  = 0.02
GARCH_ALPHA  = 0.15
GARCH_BETA   = 0.80
VAR_DECOHERENCE = 0.200
VAR_CAUTION     = 0.120
VAR_CALM        = 0.080

STOP_WORDS = {
    "the","and","for","that","this","with","are","was","were","has",
    "have","had","not","but","from","they","their","what","which","when",
    "been","will","would","could","should","does","did","its","you","your",
    "our","can","all","one","also","more","than","then","just","into",
    "over","after","about","there","these",
}

PRESETS = {
    "DEFAULT":   {"varDec":0.200,"varCau":0.120,"varCal":0.080,"garchOmega":0.02,"garchAlpha":0.15,"garchBeta":0.80},
    "TECHNICAL": {"varDec":0.180,"varCau":0.100,"varCal":0.060,"garchOmega":0.02,"garchAlpha":0.12,"garchBeta":0.83},
    "CREATIVE":  {"varDec":0.280,"varCau":0.160,"varCal":0.100,"garchOmega":0.03,"garchAlpha":0.18,"garchBeta":0.75},
    "RESEARCH":  {"varDec":0.220,"varCau":0.130,"varCal":0.085,"garchOmega":0.02,"garchAlpha":0.13,"garchBeta":0.82},
    "MEDICAL":   {"varDec":0.150,"varCau":0.090,"varCal":0.055,"garchOmega":0.015,"garchAlpha":0.10,"garchBeta":0.87},
    "CIRCUIT":   {"varDec":0.140,"varCau":0.080,"varCal":0.050,"garchOmega":0.012,"garchAlpha":0.09,"garchBeta":0.88},
}


# ── Text utilities ────────────────────────────────────────────────────────────

def tokenize(text: str) -> list[str]:
    return [w for w in re.sub(r"[^a-z0-9\s]", "", text.lower()).split()
            if len(w) > 2 and w not in STOP_WORDS]

def build_term_freq(tokens: list[str]) -> dict[str, float]:
    if not tokens:
        return {}
    freq: dict[str, int] = {}
    for w in tokens:
        freq[w] = freq.get(w, 0) + 1
    total = sum(freq.values()) or 1
    return {w: c / total for w, c in freq.items()}

def tfidf_similarity(a: list[str], b: list[str]) -> float:
    tfa, tfb = build_term_freq(a), build_term_freq(b)
    all_terms = set(tfa) | set(tfb)
    if not all_terms:
        return 1.0
    dot = norm_a = norm_b = 0.0
    for t in all_terms:
        in_a = 1 if t in tfa else 0
        in_b = 1 if t in tfb else 0
        idf = math.log((3) / (in_a + in_b + 1)) + 1 if (in_a + in_b) > 0 else 0
        va = tfa.get(t, 0) * idf
        vb = tfb.get(t, 0) * idf
        dot += va * vb
        norm_a += va * va
        norm_b += vb * vb
    denom = math.sqrt(norm_a) * math.sqrt(norm_b)
    return min(dot / denom, 1.0) if denom else 0.0

def jsd(a: list[str], b: list[str]) -> float:
    pa, pb = build_term_freq(a), build_term_freq(b)
    all_terms = set(pa) | set(pb)
    if not all_terms:
        return 0.0
    m = {t: ((pa.get(t, 0) + pb.get(t, 0)) / 2) for t in all_terms}
    def kl(p, q_dict):
        return sum(pv * math.log(pv / q_dict.get(t, 1e-10))
                   for t, pv in p.items() if pv > 0)
    return min(1.0, max(0.0, (kl(pa, m) + kl(pb, m)) / (2 * math.log(2))))


# ── Coherence scoring ─────────────────────────────────────────────────────────

def compute_coherence(new_content: str, history: list[dict]) -> float:
    ah = [m for m in history if m["role"] == "assistant"]
    if not ah:
        return 0.88
    new_t = tokenize(new_content)
    rec_t = tokenize(" ".join(m["content"] for m in ah[-4:]))
    vocab      = tfidf_similarity(new_t, rec_t)
    jsd_score  = 1 - jsd(new_t, rec_t)
    avg_len    = sum(len(m["content"]) for m in ah) / len(ah)
    len_score  = math.exp(-abs(len(new_content) - avg_len) / max(avg_len, 1) * 2)
    def sents(t): return len([s for s in re.split(r"[.!?]+", t) if len(s.strip()) > 8])
    new_sc = sents(new_content)
    avg_sc = sum(sents(m["content"]) for m in ah) / len(ah)
    struct = math.exp(-abs(new_sc - avg_sc) / max(avg_sc, 1) * 1.5)
    tf: dict[str, int] = {}
    for w in rec_t:
        tf[w] = tf.get(w, 0) + 1
    top = sorted(tf, key=tf.get, reverse=True)[:15]
    persist = sum(1 for t in top if t in new_t) / len(top) if top else 1.0
    last_t = tokenize(ah[-1]["content"])
    overlap = sum(1 for w in last_t if w in new_t) / len(last_t) if last_t else 0
    rep_pen = 0.65 if overlap > 0.65 else 1.0
    raw = (0.25*vocab + 0.25*jsd_score + 0.25*len_score +
           0.15*struct + 0.10*persist) * rep_pen
    turn_w = min(len(ah) / 10, 1.0)
    return min(max(turn_w * raw + (1 - turn_w) * 0.75, 0.30), 0.99)


# ── Kalman filter ─────────────────────────────────────────────────────────────

@dataclass
class KalmanState:
    x: float = 0.0
    P: float = 0.05

def kalman_step(state: KalmanState, obs: float, t: float) -> KalmanState:
    lam = DAMPING
    alpha, beta_p = -0.25, 0.18
    omega = 2 * math.pi / 12
    a_t = lam * (alpha + beta_p * math.sin(omega * t))
    F = 1 + a_t
    Q = (KALMAN_SIGMA_P * lam) ** 2
    x_p = F * state.x
    P_p = F * F * state.P + Q
    K = P_p / (P_p + KALMAN_R)
    return KalmanState(x=x_p + K * (obs - x_p), P=max((1 - K) * P_p, 1e-8))


# ── GARCH variance ────────────────────────────────────────────────────────────

def update_smoothed_variance(history: list[float], prev: Optional[float],
                              cfg: dict) -> float:
    if len(history) < 2:
        return prev or 0.0
    recent = history[-20:]
    mean   = sum(recent) / len(recent)
    raw_var = sum((v - mean) ** 2 for v in recent) / len(recent)
    if prev is None:
        return raw_var
    eps2  = (history[-1] - mean) ** 2
    garch = cfg["garchOmega"] + cfg["garchAlpha"] * eps2 + cfg["garchBeta"] * prev
    w     = min(len(history) / 10, 1.0)
    return w * garch + (1 - w) * raw_var


# ── Turn result ───────────────────────────────────────────────────────────────

@dataclass
class TurnResult:
    turn: int
    raw_c: float
    kalman_x: float
    kalman_p: float
    smoothed_var: float
    drift: bool
    variance_state: str
    content_preview: str = ""


# ── Main scorer ───────────────────────────────────────────────────────────────

def score_transcript(transcript: list[dict], preset: str = "DEFAULT") -> dict:
    """
    Score a full transcript offline using VECTOR's math engine.
    Returns per-turn results + aggregate metrics.

    This is the core harness interface — analogous to MemorySystem.predict()
    in the Meta-Harness framework (Lee et al. 2026).
    """
    cfg = PRESETS.get(preset, PRESETS["DEFAULT"])
    results: list[TurnResult] = []
    history: list[dict] = []
    score_history: list[float] = []
    kalman = KalmanState()
    smoothed_var: Optional[float] = None
    drift_count = 0
    calm_streak = 0

    turns = []
    for msg in transcript:
        if msg["role"] == "user":
            turns.append({"user": msg, "assistant": None})
        elif msg["role"] == "assistant" and turns:
            turns[-1]["assistant"] = msg

    for i, pair in enumerate(turns):
        if not pair["assistant"]:
            continue
        content = pair["assistant"]["content"]
        history.append(pair["user"])
        raw_c = compute_coherence(content, history)
        score_history.append(raw_c)
        t_k = (i + 1) * (2 * math.pi / 12)
        kalman = kalman_step(kalman, raw_c, t_k)
        smoothed_var = update_smoothed_variance(score_history, smoothed_var, cfg)
        sv = smoothed_var or 0.0
        if sv > cfg["varDec"]:
            vs = "DECOHERENCE"
        elif sv > cfg["varCau"]:
            vs = "CAUTION"
        elif sv < cfg["varCal"]:
            vs = "CALM"
        else:
            vs = "NOMINAL"
        drift = raw_c < (kalman.x + 0.015)  # simplified band check
        if drift:
            drift_count += 1
            calm_streak = 0
        else:
            calm_streak += 1
        results.append(TurnResult(
            turn=i + 1,
            raw_c=round(raw_c, 4),
            kalman_x=round(kalman.x, 4),
            kalman_p=round(kalman.P, 6),
            smoothed_var=round(sv, 6),
            drift=drift,
            variance_state=vs,
            content_preview=content[:80].replace("\n", " "),
        ))
        history.append(pair["assistant"])

    if not results:
        return {"error": "No assistant turns found in transcript"}

    avg_c = sum(r.raw_c for r in results) / len(results)
    return {
        "preset": preset,
        "turns": len(results),
        "avg_c": round(avg_c, 4),
        "drift_events": drift_count,
        "calm_streak_final": calm_streak,
        "final_variance_state": results[-1].variance_state if results else "N/A",
        "health": max(0, round(avg_c * 100) - drift_count * 8),
        "per_turn": [asdict(r) for r in results],
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="VECTOR Offline Harness")
    parser.add_argument("--transcript", required=True, help="Path to transcript JSON")
    parser.add_argument("--preset", default="DEFAULT", choices=list(PRESETS))
    parser.add_argument("--output", help="Output JSON path (default: stdout)")
    args = parser.parse_args()

    transcript_path = Path(args.transcript)
    if not transcript_path.exists():
        print(f"Error: transcript not found: {transcript_path}", file=sys.stderr)
        sys.exit(1)

    transcript = json.loads(transcript_path.read_text())
    results = score_transcript(transcript, args.preset)

    output = json.dumps(results, indent=2)
    if args.output:
        Path(args.output).write_text(output)
        print(f"Results written to {args.output}")
        print(f"Preset: {args.preset} | Avg C: {results['avg_c']} | "
              f"Drifts: {results['drift_events']} | Health: {results['health']}")
    else:
        print(output)


if __name__ == "__main__":
    main()
