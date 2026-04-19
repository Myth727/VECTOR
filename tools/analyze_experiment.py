#!/usr/bin/env python3
"""
VECTOR experiment analyzer.

Consumes a bundle of exported VECTOR session JSON files plus an optional
ground-truth export, and produces the full validation-experiment report:

  1. Shadow-baseline forward-delta statistics per (lag, bin)
  2. P(recovery) in each arm
  3. Fisher's exact on recovery rates
  4. Mann-Whitney U on pooled forward deltas, with Benjamini-Hochberg
     correction across (lag, bin) cells
  5. Signal validation against ground truth: precision / recall / F1
  6. Granger causality: does policy firing Granger-cause coherence?

Inputs:
  --sessions  DIR   directory of VECTOR session JSON exports
  --gt        FILE  optional ground-truth export JSON (from exportGroundTruth)
  --alpha     FLOAT BH-corrected rejection threshold (default 0.05)
  --out       FILE  where to write the report JSON (default stdout)

Session JSON shape (what VECTOR exports already produces):
  {
    "sessionId": "...",
    "coherenceData": [
      {"raw": 0.82, "originIsPolicy": false, "forwardDeltas": {"1": 0.03, ...},
       "recovered": null, ...},
      ...
    ],
    ...
  }

No external dependencies. Standard library only. This is intentional —
the SDK provides a TypeScript implementation of every test here, and this
Python version exists so you can run analysis without a Node toolchain
and without pulling scipy onto the phone.

© 2026 Hudson & Perry Research · MIT License
"""

from __future__ import annotations
import argparse
import json
import math
import os
import sys
from typing import Dict, List, Optional, Tuple


# ── Constants shared with sdk/causal.ts and sdk/groundtruth.ts ────

BIN_EDGE_LOW       = 0.50
BIN_EDGE_MID       = 0.75
DRIFT_THRESHOLD    = 0.50
RECOVERY_THRESHOLD = 0.60
RECOVERY_WINDOW    = 3
MAX_LAG            = 5
MIN_COMPARE        = 5


def coherence_bin(c: float) -> str:
    if c < BIN_EDGE_LOW: return 'low'
    if c < BIN_EDGE_MID: return 'mid'
    return 'high'


# ── Shadow stats aggregator ──────────────────────────────────────

def compute_shadow_stats(entries: List[dict]) -> dict:
    bins = ['low', 'mid', 'high']
    raw_policy   = {k: {b: [] for b in bins} for k in range(1, MAX_LAG+1)}
    raw_baseline = {k: {b: [] for b in bins} for k in range(1, MAX_LAG+1)}
    sample_size  = {'policyOrigins': 0, 'baselineOrigins': 0}
    recovery_policy   = {'recovered': 0, 'total': 0}
    recovery_baseline = {'recovered': 0, 'total': 0}

    for i, origin in enumerate(entries):
        is_policy = origin.get('originIsPolicy') is True
        is_clean_baseline = False
        if not is_policy:
            is_clean_baseline = True
            end = min(i + MAX_LAG, len(entries) - 1)
            for j in range(i + 1, end + 1):
                if entries[j].get('originIsPolicy') is True:
                    is_clean_baseline = False
                    break
        if not is_policy and not is_clean_baseline:
            continue

        if is_policy:        sample_size['policyOrigins']   += 1
        if is_clean_baseline: sample_size['baselineOrigins'] += 1

        raw = origin.get('raw')
        if not isinstance(raw, (int, float)): continue
        b = coherence_bin(raw)
        fd = origin.get('forwardDeltas') or {}
        for k in range(1, MAX_LAG + 1):
            d = fd.get(str(k), fd.get(k))
            if not isinstance(d, (int, float)): continue
            if not math.isfinite(d): continue
            if is_policy: raw_policy[k][b].append(float(d))
            else:         raw_baseline[k][b].append(float(d))

        if raw < DRIFT_THRESHOLD:
            recovered = isinstance(origin.get('recovered'), (int, float))
            if is_policy:
                recovery_policy['total'] += 1
                if recovered: recovery_policy['recovered'] += 1
            elif is_clean_baseline:
                recovery_baseline['total'] += 1
                if recovered: recovery_baseline['recovered'] += 1

    rp_rate = (recovery_policy['recovered'] / recovery_policy['total']) if recovery_policy['total'] > 0 else None
    rb_rate = (recovery_baseline['recovered'] / recovery_baseline['total']) if recovery_baseline['total'] > 0 else None

    return {
        'rawPolicy':   raw_policy,
        'rawBaseline': raw_baseline,
        'sampleSize':  sample_size,
        'recoveryPolicy':   {**recovery_policy, 'rate': rp_rate},
        'recoveryBaseline': {**recovery_baseline, 'rate': rb_rate},
    }


# ── Mann-Whitney U (two-sided, tie-corrected, normal approx) ─────

def mann_whitney_u(xs: List[float], ys: List[float]) -> dict:
    n1, n2 = len(xs), len(ys)
    if n1 == 0 or n2 == 0:
        return {'U': 0, 'n1': n1, 'n2': n2, 'z': None, 'pTwoSided': None, 'method': 'degenerate'}
    all_pairs = [(v, 0) for v in xs] + [(v, 1) for v in ys]
    all_pairs.sort(key=lambda p: p[0])
    ranks = [0.0] * len(all_pairs)
    tie_groups = []
    i = 0
    while i < len(all_pairs):
        j = i
        while j + 1 < len(all_pairs) and all_pairs[j+1][0] == all_pairs[i][0]:
            j += 1
        midrank = ((i + 1) + (j + 1)) / 2
        if j - i + 1 > 1: tie_groups.append(j - i + 1)
        for k in range(i, j + 1): ranks[k] = midrank
        i = j + 1
    R1 = sum(ranks[k] for k in range(len(all_pairs)) if all_pairs[k][1] == 0)
    U1 = R1 - n1 * (n1 + 1) / 2
    U2 = n1 * n2 - U1
    U = min(U1, U2)
    N = n1 + n2
    mean_u = n1 * n2 / 2
    tie_sum = sum(t*t*t - t for t in tie_groups)
    var_u = (n1 * n2 / 12) * ((N + 1) - tie_sum / (N * (N - 1))) if N > 1 else 0
    if var_u <= 0:
        return {'U': U, 'n1': n1, 'n2': n2, 'z': 0.0, 'pTwoSided': 1.0, 'method': 'normal-approx'}
    dev = max(0, abs(U - mean_u) - 0.5)
    z = (-1 if U < mean_u else 1) * dev / math.sqrt(var_u)
    p = 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))
    return {'U': U, 'n1': n1, 'n2': n2, 'z': z, 'pTwoSided': p, 'method': 'normal-approx'}


# ── Fisher's exact (two-sided) ───────────────────────────────────

def log_fact(n: int) -> float:
    if n < 2: return 0.0
    return math.lgamma(n + 1)

def log_binom(n: int, k: int) -> float:
    if k < 0 or k > n: return -math.inf
    return log_fact(n) - log_fact(k) - log_fact(n - k)

def fisher_exact(a: int, b: int, c: int, d: int) -> dict:
    a, b, c, d = max(0, int(round(a))), max(0, int(round(b))), max(0, int(round(c))), max(0, int(round(d)))
    r1, r2, c1, c2, N = a+b, c+d, a+c, b+d, a+b+c+d
    odds_ratio = None
    if b > 0 and c > 0: odds_ratio = (a*d) / (b*c)
    elif a*d > 0:        odds_ratio = float('inf')
    if r1 == 0 or r2 == 0 or c1 == 0 or c2 == 0:
        return {'a': a, 'b': b, 'c': c, 'd': d, 'oddsRatio': odds_ratio, 'pTwoSided': 1.0}
    a_min = max(0, r1 - c2); a_max = min(r1, c1)
    log_p_obs = log_binom(c1, a) + log_binom(c2, b) - log_binom(N, r1)
    p_sum = 0.0
    for k in range(a_min, a_max + 1):
        bk, ck, dk = r1 - k, c1 - k, r2 - (c1 - k)
        if bk < 0 or ck < 0 or dk < 0: continue
        log_p = log_binom(c1, k) + log_binom(c2, bk) - log_binom(N, r1)
        if log_p <= log_p_obs + 1e-12: p_sum += math.exp(log_p)
    return {'a': a, 'b': b, 'c': c, 'd': d, 'oddsRatio': odds_ratio, 'pTwoSided': min(1.0, p_sum)}


# ── Benjamini-Hochberg ───────────────────────────────────────────

def benjamini_hochberg(pvals: List[float], alpha: float = 0.05) -> dict:
    m = len(pvals)
    if m == 0: return {'adjusted': [], 'rejected': [], 'alpha': alpha, 'm': 0}
    indexed = sorted(enumerate(pvals), key=lambda p: p[1])
    adj_sorted = [0.0] * m
    for rank in range(m - 1, -1, -1):
        raw = indexed[rank][1] * m / (rank + 1)
        capped = min(1.0, raw)
        adj_sorted[rank] = capped if rank == m - 1 else min(capped, adj_sorted[rank + 1])
    adjusted = [0.0] * m
    rejected = [False] * m
    for rank in range(m):
        orig = indexed[rank][0]
        adjusted[orig] = adj_sorted[rank]
        rejected[orig] = adj_sorted[rank] <= alpha
    return {'adjusted': adjusted, 'rejected': rejected, 'alpha': alpha, 'm': m}


# ── Percentile bootstrap ─────────────────────────────────────────

def bootstrap_ci(xs: List[float], ys: List[float], iters: int = 2000, ci_level: float = 0.95, seed: int = 42) -> Optional[dict]:
    if len(xs) < 2 or len(ys) < 2: return None
    # Mulberry32 reproducibility
    s = seed & 0xFFFFFFFF
    def rng():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = s
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    diffs = []
    nX, nY = len(xs), len(ys)
    for _ in range(iters):
        sx = sum(xs[int(rng() * nX)] for _ in range(nX)) / nX
        sy = sum(ys[int(rng() * nY)] for _ in range(nY)) / nY
        diffs.append(sy - sx)
    diffs.sort()
    alpha = (1 - ci_level) / 2
    lo_idx = int(alpha * iters)
    hi_idx = min(iters - 1, math.ceil((1 - alpha) * iters) - 1)
    mean_x = sum(xs) / nX; mean_y = sum(ys) / nY
    return {'meanDiff': mean_y - mean_x, 'lo': diffs[lo_idx], 'hi': diffs[hi_idx],
            'ciLevel': ci_level, 'iters': iters, 'nX': nX, 'nY': nY}


# ── Granger causality (F-test via incomplete-beta p-value) ───────

def solve_normal(X: List[List[float]], y: List[float]) -> Optional[List[float]]:
    n, k = len(X), len(X[0])
    XtX = [[0.0]*k for _ in range(k)]
    Xty = [0.0]*k
    for i in range(n):
        for a in range(k):
            for b in range(k): XtX[a][b] += X[i][a] * X[i][b]
            Xty[a] += X[i][a] * y[i]
    M = [row + [Xty[i]] for i, row in enumerate(XtX)]
    for i in range(k):
        pivot = i
        for j in range(i+1, k):
            if abs(M[j][i]) > abs(M[pivot][i]): pivot = j
        if abs(M[pivot][i]) < 1e-12: return None
        if pivot != i: M[i], M[pivot] = M[pivot], M[i]
        for j in range(i+1, k):
            f = M[j][i] / M[i][i]
            for c in range(i, k+1): M[j][c] -= f * M[i][c]
    beta = [0.0]*k
    for i in range(k-1, -1, -1):
        s = M[i][k]
        for j in range(i+1, k): s -= M[i][j] * beta[j]
        beta[i] = s / M[i][i]
    return beta

def fit_rss(X: List[List[float]], y: List[float]) -> Optional[float]:
    beta = solve_normal(X, y)
    if beta is None: return None
    rss = 0.0
    for i in range(len(X)):
        pred = sum(X[i][j] * beta[j] for j in range(len(X[i])))
        rss += (y[i] - pred) ** 2
    return rss

def incomplete_beta(a: float, b: float, x: float) -> float:
    # scipy.special.betainc equivalent via math library
    # Python's math has no direct function; use continued fraction.
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    lnBeta = math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)
    front = math.exp(math.log(x) * a + math.log(1 - x) * b - lnBeta) / a
    # Lentz continued fraction
    f, c, d = 1.0, 1.0, 0.0
    for m in range(1, 201):
        m2 = 2*m
        num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
        d = 1 + num * d
        if abs(d) < 1e-30: d = 1e-30
        c = 1 + num / c
        if abs(c) < 1e-30: c = 1e-30
        d = 1 / d
        f *= d * c
        num = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
        d = 1 + num * d
        if abs(d) < 1e-30: d = 1e-30
        c = 1 + num / c
        if abs(c) < 1e-30: c = 1e-30
        d = 1 / d
        delta = d * c
        f *= delta
        if abs(delta - 1) < 3e-7: break
    return front * (f - 1)

def f_pvalue(x: float, d1: float, d2: float) -> float:
    if x <= 0: return 1.0
    if not math.isfinite(x): return 0.0
    t = d2 / (d2 + d1 * x)
    return incomplete_beta(d2 / 2, d1 / 2, t)

def granger_causality(y: List[float], x: List[float], p_y: int = 2, p_x: int = 2) -> dict:
    if len(y) != len(x):
        return {'F': 0, 'df1': 0, 'df2': 0, 'pValue': None, 'method': 'degenerate'}
    max_lag = max(p_y, p_x)
    n = len(y) - max_lag
    kU = 1 + p_y + p_x
    if n < kU + 5:
        return {'F': 0, 'df1': p_x, 'df2': max(0, n - kU), 'pValue': None,
                'nObservations': n, 'pLagsY': p_y, 'pLagsX': p_x, 'method': 'degenerate'}
    y_tgt = [0.0]*n
    Xr = [[0.0]*(1 + p_y) for _ in range(n)]
    Xu = [[0.0]*(1 + p_y + p_x) for _ in range(n)]
    for i in range(n):
        t = i + max_lag
        y_tgt[i] = y[t]
        Xr[i][0] = 1; Xu[i][0] = 1
        for j in range(1, p_y + 1):
            Xr[i][j] = y[t - j]; Xu[i][j] = y[t - j]
        for j in range(1, p_x + 1):
            Xu[i][p_y + j] = x[t - j]
    rss_r = fit_rss(Xr, y_tgt)
    rss_u = fit_rss(Xu, y_tgt)
    if rss_r is None or rss_u is None or rss_u <= 0:
        return {'F': 0, 'df1': p_x, 'df2': n - kU, 'pValue': None,
                'nObservations': n, 'pLagsY': p_y, 'pLagsX': p_x, 'method': 'degenerate'}
    df1, df2 = p_x, n - kU
    F = ((rss_r - rss_u) / df1) / (rss_u / df2)
    return {'F': F, 'df1': df1, 'df2': df2, 'pValue': f_pvalue(F, df1, df2),
            'rssRestricted': rss_r, 'rssUnrestricted': rss_u,
            'nObservations': n, 'pLagsY': p_y, 'pLagsX': p_x, 'method': 'F-test'}


# ── Signal validation vs ground truth ────────────────────────────

def validate_signals(gt_export: dict, tau_c: float = 0.50) -> dict:
    pairs = []
    for t in gt_export.get('tasks', []):
        c = t.get('coherenceAtTurn')
        if isinstance(c, (int, float)): pairs.append((c, not t.get('correct', True)))
    for lab in gt_export.get('labels', []):
        c = lab.get('coherenceAtTurn')
        if isinstance(c, (int, float)): pairs.append((c, lab.get('label', 'good') != 'good'))
    for f in gt_export.get('flags', []):
        c = f.get('coherenceAtTurn')
        if isinstance(c, (int, float)): pairs.append((c, True))
    tp = fp = tn = fn = 0
    sum_failed = sum_succeeded = 0.0
    nF = nS = 0
    for c, failed in pairs:
        low = c < tau_c
        if low and failed: tp += 1
        elif low and not failed: fp += 1
        elif not low and not failed: tn += 1
        elif not low and failed: fn += 1
        if failed: sum_failed += c; nF += 1
        else:       sum_succeeded += c; nS += 1
    prec = tp / (tp + fp) if (tp + fp) > 0 else None
    rec  = tp / (tp + fn) if (tp + fn) > 0 else None
    f1   = 2 * prec * rec / (prec + rec) if (prec is not None and rec is not None and (prec + rec) > 0) else None
    total = len(pairs)
    acc  = (tp + tn) / total if total > 0 else None
    return {
        'n': total, 'truePositives': tp, 'falsePositives': fp,
        'trueNegatives': tn, 'falseNegatives': fn,
        'precision': prec, 'recall': rec, 'f1': f1, 'accuracy': acc,
        'meanCFailed':    (sum_failed / nF) if nF > 0 else None,
        'meanCSucceeded': (sum_succeeded / nS) if nS > 0 else None,
        'deltaCClasses':  ((sum_succeeded / nS) - (sum_failed / nF)) if (nF > 0 and nS > 0) else None,
        'sourceCounts': {
            'tasks':  len(gt_export.get('tasks', [])),
            'labels': len(gt_export.get('labels', [])),
            'flags':  len(gt_export.get('flags', [])),
        },
    }


# ── Assembler ────────────────────────────────────────────────────

def analyze(sessions_dir: str, gt_path: Optional[str], alpha: float = 0.05) -> dict:
    if not os.path.isdir(sessions_dir):
        raise SystemExit(f"sessions dir does not exist: {sessions_dir}")
    all_entries: List[dict] = []
    session_ids = []
    for fname in sorted(os.listdir(sessions_dir)):
        if not fname.endswith('.json'): continue
        with open(os.path.join(sessions_dir, fname), 'r') as f:
            try: sess = json.load(f)
            except Exception: continue
        session_ids.append(sess.get('sessionId') or fname)
        cd = sess.get('coherenceData', [])
        if isinstance(cd, list): all_entries.extend(cd)

    shadow = compute_shadow_stats(all_entries)

    # Fisher on pooled recovery
    rp, rb = shadow['recoveryPolicy'], shadow['recoveryBaseline']
    recovery_fisher = fisher_exact(
        rp['recovered'], rp['total'] - rp['recovered'],
        rb['recovered'], rb['total'] - rb['recovered']
    ) if (rp['total'] > 0 and rb['total'] > 0) else None

    # Pooled bootstrap
    pool_p, pool_b = [], []
    for k in range(1, MAX_LAG + 1):
        for b in ['low', 'mid', 'high']:
            pool_p.extend(shadow['rawPolicy'][k][b])
            pool_b.extend(shadow['rawBaseline'][k][b])
    pool_bootstrap = bootstrap_ci(pool_b, pool_p)

    # Per-cell MW + BH
    cells = []
    for k in range(1, MAX_LAG + 1):
        for b in ['low', 'mid', 'high']:
            xs, ys = shadow['rawBaseline'][k][b], shadow['rawPolicy'][k][b]
            mw = mann_whitney_u(xs, ys) if len(xs) >= 2 and len(ys) >= 2 else None
            cells.append({
                'lag': k, 'bin': b,
                'nPolicy': len(ys), 'nBaseline': len(xs),
                'meanPolicy':   sum(ys)/len(ys) if ys else None,
                'meanBaseline': sum(xs)/len(xs) if xs else None,
                'mw': mw,
            })
    tested = [c['mw']['pTwoSided'] for c in cells if c['mw'] and c['mw']['pTwoSided'] is not None]
    bh = benjamini_hochberg(tested, alpha)
    adj_i = 0
    for c in cells:
        if c['mw'] is None or c['mw']['pTwoSided'] is None:
            c['adjustedP'] = None; c['rejected'] = None
        else:
            c['adjustedP'] = bh['adjusted'][adj_i]
            c['rejected']  = bh['rejected'][adj_i]
            adj_i += 1

    # Granger: build C(t) and I(t) (policy indicator at turn t)
    c_series = [e.get('raw') for e in all_entries if isinstance(e.get('raw'), (int, float))]
    i_series = [1.0 if e.get('originIsPolicy') is True else 0.0
                for e in all_entries if isinstance(e.get('raw'), (int, float))]
    granger = granger_causality(c_series, i_series, p_y=2, p_x=2) if len(c_series) > 20 else None

    # Signal validation
    signal_val = None
    if gt_path and os.path.isfile(gt_path):
        with open(gt_path, 'r') as f:
            gt = json.load(f)
        signal_val = validate_signals(gt)

    return {
        'sessionsAnalyzed': len(session_ids),
        'totalTurns':       len(all_entries),
        'sampleSize':       shadow['sampleSize'],
        'recoveryPolicy':   shadow['recoveryPolicy'],
        'recoveryBaseline': shadow['recoveryBaseline'],
        'recoveryFisher':   recovery_fisher,
        'pooledBootstrap':  pool_bootstrap,
        'cellTests':        cells,
        'bh':               {'m': bh['m'], 'alpha': bh['alpha']},
        'granger':          granger,
        'signalValidation': signal_val,
    }


def main() -> int:
    p = argparse.ArgumentParser(description='VECTOR experiment analyzer')
    p.add_argument('--sessions', required=True, help='directory of session JSON exports')
    p.add_argument('--gt', default=None, help='ground-truth export JSON')
    p.add_argument('--alpha', type=float, default=0.05, help='BH-corrected rejection threshold')
    p.add_argument('--out', default=None, help='output JSON file (default stdout)')
    args = p.parse_args()
    report = analyze(args.sessions, args.gt, args.alpha)
    text = json.dumps(report, indent=2, default=str)
    if args.out:
        with open(args.out, 'w') as f: f.write(text)
        print(f'Wrote {args.out}', file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
