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

// ── Granger causality ────────────────────────────────────────────
//
// Tests whether past values of X help predict Y beyond Y's own
// autoregressive trend. For VECTOR: does policy firing at past turns
// help predict subsequent coherence beyond coherence's own AR(p) drift?
//
// Classic F-test on nested regressions:
//   Restricted:   Y_t = α + Σ β_i Y_{t-i} + ε
//   Unrestricted: Y_t = α + Σ β_i Y_{t-i} + Σ γ_j X_{t-j} + ε'
//
// F = ((RSS_r − RSS_u) / q) / (RSS_u / (n − k))
//   q = number of X lags (restrictions)
//   n = sample size
//   k = total parameters in unrestricted model (intercept + p + q)
//
// Under H0: γ_j = 0 for all j → F ~ F(q, n−k).
// P-value from F CDF via regularized incomplete beta function.
//
// Reference: Granger, C. W. J. (1969). Investigating Causal Relations
// by Econometric Models and Cross-spectral Methods. Econometrica 37(3).

export interface GrangerResult {
  F:            number;      // test statistic
  df1:          number;      // numerator df (q = number of X lags)
  df2:          number;      // denominator df (n − k)
  pValue:       number | null;
  rssRestricted:   number;
  rssUnrestricted: number;
  nObservations:   number;
  pLagsY:       number;      // Y autoregressive order
  pLagsX:       number;      // X lag order tested
  method:       'F-test' | 'degenerate';
}

// Solve the normal equations X'Xβ = X'y via Gaussian elimination.
// Returns β vector. Lightweight — OK for p ≤ ~10 which is all we need.
function solveNormalEquations(X: number[][], y: number[]): number[] | null {
  const n = X.length;
  const k = X[0].length;
  // Build augmented matrix [X'X | X'y]
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
      Xty[a] += X[i][a] * y[i];
    }
  }
  // Augmented
  const M: number[][] = XtX.map((row, i) => [...row, Xty[i]]);
  // Gaussian elimination with partial pivoting
  for (let i = 0; i < k; i++) {
    let pivot = i;
    for (let j = i + 1; j < k; j++) {
      if (Math.abs(M[j][i]) > Math.abs(M[pivot][i])) pivot = j;
    }
    if (Math.abs(M[pivot][i]) < 1e-12) return null;  // singular
    if (pivot !== i) { const tmp = M[i]; M[i] = M[pivot]; M[pivot] = tmp; }
    for (let j = i + 1; j < k; j++) {
      const f = M[j][i] / M[i][i];
      for (let c = i; c <= k; c++) M[j][c] -= f * M[i][c];
    }
  }
  // Back-substitute
  const beta = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = M[i][k];
    for (let j = i + 1; j < k; j++) s -= M[i][j] * beta[j];
    beta[i] = s / M[i][i];
  }
  return beta;
}

// Residual sum of squares after fitting X β = y via OLS.
function fitAndGetRSS(X: number[][], y: number[]): number | null {
  const beta = solveNormalEquations(X, y);
  if (!beta) return null;
  let rss = 0;
  for (let i = 0; i < X.length; i++) {
    let pred = 0;
    for (let j = 0; j < X[i].length; j++) pred += X[i][j] * beta[j];
    const e = y[i] - pred;
    rss += e * e;
  }
  return rss;
}

// Regularized incomplete beta function I_x(a, b).
// Continued-fraction expansion (Numerical Recipes §6.4, Lentz 1976).
function lnGamma(z: number): number {
  // Lanczos approximation, g=7, n=9. Valid z > 0.
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    // Reflection: lnΓ(z) = ln(π / sin(πz)) − lnΓ(1−z)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < c.length; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) return h;
  }
  return h;  // did not converge in MAXIT; return last estimate
}

export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return NaN;
  if (x === 0 || x === 1) return x;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b)
    + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  } else {
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
}

// P-value from F CDF: P(F_{d1,d2} ≥ x) under H0
export function fPValue(x: number, d1: number, d2: number): number {
  if (x <= 0) return 1;
  if (!isFinite(x)) return 0;
  // Using: P(F ≥ x) = I_{d2/(d2+d1*x)}(d2/2, d1/2)
  const t = d2 / (d2 + d1 * x);
  return regularizedIncompleteBeta(d2 / 2, d1 / 2, t);
}

/**
 * Granger-causality test: does X Granger-cause Y?
 *
 * Parameters:
 *   y, x — same-length time series
 *   pY   — autoregressive order on Y (how many Y lags)
 *   pX   — X lag order tested (how many X lags)
 *
 * Null hypothesis: all X coefficients are zero (X does not improve prediction
 * of Y beyond Y's own autoregression).
 *
 * Returns the F statistic, p-value, and degrees of freedom. Small sample
 * warning: requires n > (pY + pX + 1) + 10 for meaningful inference.
 */
export function grangerCausality(
  y:  number[],
  x:  number[],
  pY: number = 2,
  pX: number = 2
): GrangerResult {
  if (y.length !== x.length) {
    return {
      F: 0, df1: 0, df2: 0, pValue: null,
      rssRestricted: 0, rssUnrestricted: 0,
      nObservations: 0, pLagsY: pY, pLagsX: pX, method: 'degenerate',
    };
  }
  const maxLag = Math.max(pY, pX);
  const n = y.length - maxLag;
  const kU = 1 + pY + pX;  // unrestricted: intercept + Y lags + X lags
  const kR = 1 + pY;       // restricted:   intercept + Y lags
  if (n < kU + 5) {
    return {
      F: 0, df1: pX, df2: Math.max(0, n - kU), pValue: null,
      rssRestricted: 0, rssUnrestricted: 0,
      nObservations: n, pLagsY: pY, pLagsX: pX, method: 'degenerate',
    };
  }
  // Build design matrices
  const yTgt: number[] = new Array(n);
  const Xr:   number[][] = Array.from({ length: n }, () => new Array(kR).fill(0));
  const Xu:   number[][] = Array.from({ length: n }, () => new Array(kU).fill(0));
  for (let i = 0; i < n; i++) {
    const t = i + maxLag;
    yTgt[i] = y[t];
    Xr[i][0] = 1;
    Xu[i][0] = 1;
    for (let j = 1; j <= pY; j++) {
      Xr[i][j] = y[t - j];
      Xu[i][j] = y[t - j];
    }
    for (let j = 1; j <= pX; j++) {
      Xu[i][pY + j] = x[t - j];
    }
  }
  const rssR = fitAndGetRSS(Xr, yTgt);
  const rssU = fitAndGetRSS(Xu, yTgt);
  if (rssR === null || rssU === null || rssU <= 0) {
    return {
      F: 0, df1: pX, df2: n - kU, pValue: null,
      rssRestricted: rssR ?? 0, rssUnrestricted: rssU ?? 0,
      nObservations: n, pLagsY: pY, pLagsX: pX, method: 'degenerate',
    };
  }
  const df1 = pX;
  const df2 = n - kU;
  const F = ((rssR - rssU) / df1) / (rssU / df2);
  const pValue = fPValue(F, df1, df2);
  return {
    F, df1, df2, pValue,
    rssRestricted: rssR, rssUnrestricted: rssU,
    nObservations: n, pLagsY: pY, pLagsX: pX, method: 'F-test',
  };
}
