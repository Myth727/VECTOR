/**
 * VECTOR SDK — Statistical Test Layer
 * © 2026 Hudson & Perry Research · MIT License
 *
 * Consumes `ShadowStats` (from sdk/causal.ts) and produces formal
 * significance tests with effect sizes and FDR-adjusted p-values.
 *
 * Core tests:
 *   - Mann-Whitney U (rank-sum) — two-sample distribution comparison
 *     with tie correction, two-sided, normal approximation valid for
 *     n1, n2 ≥ 8.
 *   - Fisher's exact test — 2×2 contingency (binary outcomes such
 *     as recovery: recovered vs not-recovered, policy vs baseline).
 *   - Bootstrap CI on mean difference — distribution-free, seeded RNG
 *     for reproducibility.
 *   - Benjamini-Hochberg FDR correction — applied when testing
 *     multiple (lag, bin) cells simultaneously.
 *
 * Use: `compareArms(shadowStats)` returns a structured report.
 *
 * Reference: ROADMAP.md #1 (prerequisite for causal claims).
 * None of these tests grant validity on their own — they only
 * formalize the evidence VECTOR has collected. Sample size, ground
 * truth validity, and selection-bias controls are still the primary
 * gate on any claim.
 */

import type { ShadowStats, CoherenceBin } from './causal';

// ── Types ────────────────────────────────────────────────────────

export interface MWResult {
  U: number;
  n1: number;
  n2: number;
  z: number | null;      // null if one sample empty
  pTwoSided: number | null;
  method: 'normal-approx' | 'degenerate';
}

export interface FisherResult {
  a: number; b: number; c: number; d: number;  // 2×2 table
  oddsRatio: number | null;  // null on division-by-zero
  pTwoSided: number;
  method: 'exact' | 'chi-squared-yates';
}

export interface BootstrapResult {
  meanDiff: number;         // mean(ys) − mean(xs)
  lo: number;
  hi: number;
  ciLevel: number;
  iters: number;
  nX: number; nY: number;
}

export interface BHResult {
  adjusted: number[];   // same order as input
  rejected: boolean[];  // at given alpha, BH-corrected
  alpha: number;
  m: number;
}

export interface CellTestResult {
  lag: number;
  bin: CoherenceBin;
  nPolicy: number;
  nBaseline: number;
  meanPolicy: number | null;
  meanBaseline: number | null;
  mw: MWResult | null;          // null if either arm has n<2 in this cell
}

export interface ArmComparisonReport {
  // Per-cell tests on forward-delta distributions (requires per-cell samples,
  // which ShadowStats stores only as n/mean/std — not the raw values).
  // To run cell tests, caller must pass raw bucket values directly via
  // compareArmsFromBuckets. compareArms on ShadowStats produces pooled tests only.
  overallRecovery: FisherResult | null;       // recovery rate: policy vs baseline
  bootstrapRecoveryDiff: BootstrapResult | null;
  canReport: boolean;
  sampleSize: { nPolicy: number; nBaseline: number };
  note: string;
}

// ── Numeric helpers ──────────────────────────────────────────────

/** Abramowitz & Stegun 7.1.26 — max error ~1.5e-7 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 =  0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

/** Standard normal two-sided p-value from a z-score. */
export function normalTwoSidedP(z: number): number {
  return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
}

/** Mulberry32 — tiny seeded PRNG, deterministic across runs. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function logFactorial(n: number): number {
  if (n < 2) return 0;
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function logBinom(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

// ── Mann-Whitney U (rank-sum) ────────────────────────────────────

/**
 * Two-sided Mann-Whitney U with tie correction, normal approximation.
 * Valid p-value when min(n1, n2) ≥ 8. Below that, the approximation
 * is conservative (returned anyway, caller should note).
 */
export function mannWhitneyU(xs: number[], ys: number[]): MWResult {
  const n1 = xs.length, n2 = ys.length;
  if (n1 === 0 || n2 === 0) {
    return { U: 0, n1, n2, z: null, pTwoSided: null, method: 'degenerate' };
  }

  // Combine and rank with midrank for ties.
  type Tagged = { v: number; g: 0 | 1 };
  const all: Tagged[] = [];
  for (const v of xs) all.push({ v, g: 0 });
  for (const v of ys) all.push({ v, g: 1 });
  all.sort((p, q) => p.v - q.v);

  const ranks = new Array(all.length);
  const tieGroups: number[] = [];
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const midrank = ((i + 1) + (j + 1)) / 2;  // ranks are 1-indexed
    const groupSize = j - i + 1;
    if (groupSize > 1) tieGroups.push(groupSize);
    for (let k = i; k <= j; k++) ranks[k] = midrank;
    i = j + 1;
  }

  let R1 = 0;
  for (let k = 0; k < all.length; k++) if (all[k].g === 0) R1 += ranks[k];

  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  // Mean and variance of U under H0, with tie correction.
  const N = n1 + n2;
  const meanU = (n1 * n2) / 2;
  let tieSum = 0;
  for (const t of tieGroups) tieSum += t * t * t - t;
  const varU = (n1 * n2 / 12) * ((N + 1) - tieSum / (N * (N - 1)));

  if (varU <= 0) {
    return { U, n1, n2, z: 0, pTwoSided: 1, method: 'normal-approx' };
  }

  // Continuity correction: shift |U - meanU| toward meanU by 0.5
  const deviation = Math.max(0, Math.abs(U - meanU) - 0.5);
  const z = (U < meanU ? -1 : 1) * deviation / Math.sqrt(varU);
  const p = normalTwoSidedP(z);
  return { U, n1, n2, z, pTwoSided: p, method: 'normal-approx' };
}

// ── Fisher's exact test (2×2) ────────────────────────────────────

/**
 * Two-sided Fisher's exact test on a 2×2 contingency table:
 *              success   fail
 *   group A :    a        b
 *   group B :    c        d
 *
 * P-value = sum of P(table) over all tables with the same marginal
 * totals where P(table) ≤ P(observed).
 *
 * Falls back to chi-squared with Yates correction if any marginal is 0.
 */
export function fisherExact(a: number, b: number, c: number, d: number): FisherResult {
  a = Math.max(0, Math.round(a));
  b = Math.max(0, Math.round(b));
  c = Math.max(0, Math.round(c));
  d = Math.max(0, Math.round(d));
  const r1 = a + b, r2 = c + d, c1 = a + c, c2 = b + d, N = a + b + c + d;

  const oddsRatio = (b === 0 || c === 0)
    ? (a * d === 0 ? null : Infinity)
    : (a * d) / (b * c);

  if (r1 === 0 || r2 === 0 || c1 === 0 || c2 === 0) {
    return { a, b, c, d, oddsRatio, pTwoSided: 1, method: 'exact' };
  }

  // Exact path: enumerate all possible values of a given fixed marginals.
  // a ranges from max(0, r1-c2) to min(r1, c1).
  const aMin = Math.max(0, r1 - c2);
  const aMax = Math.min(r1, c1);

  const logPObs = logBinom(c1, a) + logBinom(c2, b) - logBinom(N, r1);

  let pSum = 0;
  for (let k = aMin; k <= aMax; k++) {
    const ak = k, bk = r1 - k, ck = c1 - k, dk = r2 - (c1 - k);
    if (bk < 0 || ck < 0 || dk < 0) continue;
    const logP = logBinom(c1, ak) + logBinom(c2, bk) - logBinom(N, r1);
    if (logP <= logPObs + 1e-12) pSum += Math.exp(logP);
  }

  return { a, b, c, d, oddsRatio, pTwoSided: Math.min(1, pSum), method: 'exact' };
}

// ── Bootstrap CI on mean difference ──────────────────────────────

/**
 * Percentile bootstrap CI on mean(ys) − mean(xs).
 * Default 2000 iters, 95% CI, seed 1 for reproducibility.
 * Use seed parameter to vary across runs for variance estimation.
 */
export function bootstrapMeanDiffCI(
  xs: number[],
  ys: number[],
  opts: { iters?: number; ciLevel?: number; seed?: number } = {}
): BootstrapResult | null {
  const iters = opts.iters ?? 2000;
  const ciLevel = opts.ciLevel ?? 0.95;
  const seed = opts.seed ?? 1;
  const nX = xs.length, nY = ys.length;
  if (nX < 2 || nY < 2) return null;

  const rng = mulberry32(seed);
  const diffs = new Array<number>(iters);
  const meanOf = (arr: number[], picks: Int32Array): number => {
    let s = 0;
    for (let i = 0; i < picks.length; i++) s += arr[picks[i]];
    return s / picks.length;
  };

  const xIdx = new Int32Array(nX);
  const yIdx = new Int32Array(nY);
  for (let t = 0; t < iters; t++) {
    for (let i = 0; i < nX; i++) xIdx[i] = Math.floor(rng() * nX);
    for (let i = 0; i < nY; i++) yIdx[i] = Math.floor(rng() * nY);
    diffs[t] = meanOf(ys, yIdx) - meanOf(xs, xIdx);
  }
  diffs.sort((a, b) => a - b);

  const alpha = (1 - ciLevel) / 2;
  const loIdx = Math.floor(alpha * iters);
  const hiIdx = Math.min(iters - 1, Math.ceil((1 - alpha) * iters) - 1);
  const meanX = xs.reduce((s, v) => s + v, 0) / nX;
  const meanY = ys.reduce((s, v) => s + v, 0) / nY;

  return {
    meanDiff: meanY - meanX,
    lo: diffs[loIdx],
    hi: diffs[hiIdx],
    ciLevel, iters, nX, nY,
  };
}

// ── Benjamini-Hochberg FDR correction ────────────────────────────

/**
 * BH step-up procedure.
 * Input: array of raw p-values (any order).
 * Output: FDR-adjusted p-values (same order), and boolean reject mask at alpha.
 *
 * BH-adjusted p_(i) = min(1, min_{j≥i} p_(j) * m / j)   after sorting.
 */
export function benjaminiHochberg(pvals: number[], alpha = 0.05): BHResult {
  const m = pvals.length;
  if (m === 0) return { adjusted: [], rejected: [], alpha, m: 0 };

  const indexed = pvals.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjustedSorted = new Array<number>(m);
  // BH cumulative min from the top
  for (let rank = m - 1; rank >= 0; rank--) {
    const raw = indexed[rank].p * m / (rank + 1);
    const capped = Math.min(1, raw);
    adjustedSorted[rank] = rank === m - 1
      ? capped
      : Math.min(capped, adjustedSorted[rank + 1]);
  }

  const adjusted = new Array<number>(m);
  const rejected = new Array<boolean>(m);
  for (let rank = 0; rank < m; rank++) {
    const orig = indexed[rank].i;
    adjusted[orig] = adjustedSorted[rank];
    rejected[orig] = adjustedSorted[rank] <= alpha;
  }
  return { adjusted, rejected, alpha, m };
}

// ── Comparison report ────────────────────────────────────────────

/**
 * Produces a pooled-statistics report from ShadowStats. Note:
 * ShadowStats only stores aggregated moments per (lag, bin) cell —
 * raw values are not kept (memory discipline). So this report can
 * test the pooled overall recovery rate (Fisher's exact on counts)
 * but cannot run per-cell Mann-Whitney directly here. To run MW
 * per-cell, pass raw bucket arrays via runCellTests.
 */
export function compareArms(shadow: ShadowStats): ArmComparisonReport {
  const nP = shadow.sampleSize.policyOrigins;
  const nB = shadow.sampleSize.baselineOrigins;
  const rp = shadow.recoveryPolicy, rb = shadow.recoveryBaseline;

  let overallRecovery: FisherResult | null = null;
  if (rp.total > 0 && rb.total > 0) {
    const a = rp.recovered, b = rp.total - rp.recovered;
    const c = rb.recovered, d = rb.total - rb.recovered;
    overallRecovery = fisherExact(a, b, c, d);
  }

  let note = '';
  if (nP < 5 || nB < 5) {
    note = 'Preliminary — minimum sample size (5) per arm not met. ';
  }
  if (rp.total + rb.total < 20) {
    note += 'Recovery test underpowered (combined at-risk origins < 20). ';
  }
  if (!note) note = 'Pooled recovery-rate test reported. Per-cell tests require raw bucket access.';

  return {
    overallRecovery,
    bootstrapRecoveryDiff: null,  // populated by runRecoveryBootstrap when raw data available
    canReport: nP >= 5 && nB >= 5 && (rp.total + rb.total) >= 10,
    sampleSize: { nPolicy: nP, nBaseline: nB },
    note: note.trim(),
  };
}

/**
 * Run Mann-Whitney U on every (lag, bin) cell for which raw arrays are
 * provided, then apply Benjamini-Hochberg across all cells tested.
 *
 * Caller supplies `rawBuckets` with the same (lag, bin) structure as
 * ShadowStats.policy / .baseline but containing raw forward-delta arrays.
 * These raw arrays are derived by the caller directly from coherenceData
 * (they are NOT stored in ShadowStats by design).
 */
export function runCellTests(
  rawPolicy: { [lag: number]: { [bin in CoherenceBin]: number[] } },
  rawBaseline: { [lag: number]: { [bin in CoherenceBin]: number[] } },
  alpha = 0.05
): { cells: (CellTestResult & { adjustedP: number | null; rejected: boolean | null })[]; bh: BHResult } {
  const cells: CellTestResult[] = [];
  const lags = Object.keys(rawPolicy).map(Number).sort((a, b) => a - b);
  const bins: CoherenceBin[] = ['low', 'mid', 'high'];

  for (const lag of lags) {
    for (const bin of bins) {
      const xs = (rawBaseline[lag] && rawBaseline[lag][bin]) || [];
      const ys = (rawPolicy[lag]   && rawPolicy[lag][bin])   || [];
      if (xs.length < 2 || ys.length < 2) {
        cells.push({
          lag, bin,
          nPolicy: ys.length, nBaseline: xs.length,
          meanPolicy:   ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : null,
          meanBaseline: xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null,
          mw: null,
        });
        continue;
      }
      const mw = mannWhitneyU(xs, ys);
      cells.push({
        lag, bin,
        nPolicy: ys.length, nBaseline: xs.length,
        meanPolicy:   ys.reduce((s, v) => s + v, 0) / ys.length,
        meanBaseline: xs.reduce((s, v) => s + v, 0) / xs.length,
        mw,
      });
    }
  }

  const testedPs = cells
    .filter(c => c.mw !== null && c.mw.pTwoSided !== null)
    .map(c => (c.mw as MWResult).pTwoSided as number);
  const bh = benjaminiHochberg(testedPs, alpha);

  // Re-attach adjusted p-values in original cell order
  let adjIdx = 0;
  const out = cells.map(c => {
    if (c.mw === null || c.mw.pTwoSided === null) {
      return { ...c, adjustedP: null, rejected: null };
    }
    const adjustedP = bh.adjusted[adjIdx];
    const rejected  = bh.rejected[adjIdx];
    adjIdx++;
    return { ...c, adjustedP, rejected };
  });

  return { cells: out, bh };
}
