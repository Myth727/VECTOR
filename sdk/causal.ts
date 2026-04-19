/**
 * VECTOR SDK — Causal Delta & Shadow Baseline
 * © 2026 Hudson & Perry Research · MIT License
 *
 * Trajectory-based counterfactual measurement for policy effectiveness.
 *
 * Prior versions logged `deltaCBaseline = C_t − bin-stratified historical mean`.
 * That is a LEVEL delta — it compares the current score to where history
 * typically sits in the same bin. It does not model trajectory dynamics
 * and is therefore a weak counterfactual for "would coherence have
 * recovered on its own without the intervention?".
 *
 * This module introduces a TRAJECTORY delta:
 *   forwardDelta(origin, k) = C_{origin+k} − C_origin
 *
 * Computed on matched lag structure for both arms:
 *   - Policy arm:   origin turns where injection fired
 *   - Baseline arm: origin turns with no injection AND no injection
 *                   in the next MAX_LAG turns (keeps windows disjoint)
 *
 * Plus a binary outcome metric:
 *   P(recovery) = P(C_{t+k} > 0.60 for some k ≤ 3 | C_t < 0.50)
 *
 * Pre-requisite for any causal claim about VECTOR policy effectiveness.
 * Reference: ROADMAP.md #1 (statistical tests before causal claims).
 */

// ── Types ────────────────────────────────────────────────────────

export type CoherenceBin = 'low' | 'mid' | 'high';

export interface ForwardDeltaMap {
  [lag: number]: number;  // lag 1..5 → ΔC_k
}

export interface ShadowEntry {
  raw: number;                     // C_t at origin turn (required)
  originIsPolicy?: boolean;        // injection fired AT this turn
  forwardDeltas?: ForwardDeltaMap; // populated retroactively as future turns arrive
  recovered?: number | null;       // lag at which C > RECOVERY_THRESHOLD observed
                                    // (only meaningful when raw < DRIFT_THRESHOLD)
}

export interface ArmStats {
  n: number;
  meanDelta: number | null;
  stdDelta: number | null;
}

export interface ShadowStats {
  policy:   { [lag: number]: { [bin in CoherenceBin]: ArmStats } };
  baseline: { [lag: number]: { [bin in CoherenceBin]: ArmStats } };
  recoveryPolicy:   { recovered: number; total: number; rate: number | null };
  recoveryBaseline: { recovered: number; total: number; rate: number | null };
  sampleSize:       { policyOrigins: number; baselineOrigins: number };
}

export interface ShadowSummary {
  overallPolicyDelta:   number | null;  // sample-size-weighted mean across lags/bins
  overallBaselineDelta: number | null;
  policyRecoveryRate:   number | null;
  baselineRecoveryRate: number | null;
  policyOriginsN:       number;
  baselineOriginsN:     number;
  canCompare:           boolean;        // ≥ MIN_COMPARE origins per arm
}

// ── Constants ────────────────────────────────────────────────────

export const BIN_EDGE_LOW  = 0.50;
export const BIN_EDGE_MID  = 0.75;
export const DRIFT_THRESHOLD    = 0.50;  // C < this → at-risk origin for recovery test
export const RECOVERY_THRESHOLD = 0.60;  // C > this at any lag ≤ RECOVERY_WINDOW → recovered
export const RECOVERY_WINDOW    = 3;     // lags over which recovery can be credited
export const MAX_LAG            = 5;     // forward lag horizon for policy window
export const MIN_COMPARE        = 5;     // min origins per arm to enable comparison UI

// ── Helpers ──────────────────────────────────────────────────────

export function coherenceBin(c: number): CoherenceBin {
  if (c < BIN_EDGE_LOW) return 'low';
  if (c < BIN_EDGE_MID) return 'mid';
  return 'high';
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function sampleStd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function emptyArmStats(): ArmStats {
  return { n: 0, meanDelta: null, stdDelta: null };
}

function initBinMap(): { [bin in CoherenceBin]: ArmStats } {
  return { low: emptyArmStats(), mid: emptyArmStats(), high: emptyArmStats() };
}

function initLagMap(): { [lag: number]: { [bin in CoherenceBin]: ArmStats } } {
  const out: { [lag: number]: { [bin in CoherenceBin]: ArmStats } } = {};
  for (let k = 1; k <= MAX_LAG; k++) out[k] = initBinMap();
  return out;
}

// ── Core: retroactive forward-delta update ──────────────────────

/**
 * Given prior coherenceData entries and the NEW current score, returns
 * updated prior entries with forwardDeltas[k] = C_current − C_origin
 * for each k ∈ [1..MAX_LAG], and a `recovered` lag for at-risk origins
 * where C crossed back above RECOVERY_THRESHOLD within RECOVERY_WINDOW.
 *
 * The caller then appends the new entry (with empty forwardDeltas, recovered=null):
 *
 *   const priors = propagateForwardDeltas(coherenceData, rawScore);
 *   setCoherenceData([...priors, newEntry]);
 *
 * Pure. Does not mutate input. O(MAX_LAG) per turn — constant work.
 */
export function propagateForwardDeltas<T extends ShadowEntry>(
  priors: T[],
  currentScore: number
): T[] {
  const n = priors.length;
  if (n === 0) return priors;

  return priors.map((entry, idx) => {
    const lag = n - idx;  // 1-indexed: idx=n-1 → lag=1, idx=0 → lag=n
    if (lag < 1 || lag > MAX_LAG) return entry;

    const existing = entry.forwardDeltas || {};
    const forwardDeltas: ForwardDeltaMap = { ...existing };
    forwardDeltas[lag] = parseFloat((currentScore - entry.raw).toFixed(4));

    let recovered: number | null = entry.recovered ?? null;
    if (entry.raw < DRIFT_THRESHOLD && lag <= RECOVERY_WINDOW) {
      if (recovered == null && currentScore > RECOVERY_THRESHOLD) {
        recovered = lag;
      }
    }

    return { ...entry, forwardDeltas, recovered };
  });
}

// ── Aggregation: computeShadowStats ─────────────────────────────

/**
 * Computes policy-vs-baseline forward-delta statistics from coherenceData.
 *
 * Arm definitions:
 *   Policy origin   = originIsPolicy === true  (injection fired at this turn)
 *   Baseline origin = originIsPolicy !== true  AND no injection fires
 *                     in entries [i+1 .. i+MAX_LAG]. This disjointness rule
 *                     prevents baseline windows from overlapping policy windows.
 *
 * For each arm × lag k × bin(C_origin), reports n, mean ΔC, sample std ΔC.
 * For each arm with at-risk origins (C_origin < DRIFT_THRESHOLD), reports
 * P(recovery) = recovered / total.
 */
export function computeShadowStats<T extends ShadowEntry>(
  entries: T[]
): ShadowStats {
  const stats: ShadowStats = {
    policy:   initLagMap(),
    baseline: initLagMap(),
    recoveryPolicy:   { recovered: 0, total: 0, rate: null },
    recoveryBaseline: { recovered: 0, total: 0, rate: null },
    sampleSize:       { policyOrigins: 0, baselineOrigins: 0 },
  };

  type Key = string;
  const policyBuckets:   Map<Key, number[]> = new Map();
  const baselineBuckets: Map<Key, number[]> = new Map();
  const push = (m: Map<Key, number[]>, k: Key, v: number) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };

  for (let i = 0; i < entries.length; i++) {
    const origin = entries[i];
    const isPolicy = origin.originIsPolicy === true;

    let isCleanBaseline = false;
    if (!isPolicy) {
      isCleanBaseline = true;
      const end = Math.min(i + MAX_LAG, entries.length - 1);
      for (let j = i + 1; j <= end; j++) {
        if (entries[j].originIsPolicy === true) {
          isCleanBaseline = false;
          break;
        }
      }
    }

    if (!isPolicy && !isCleanBaseline) continue;  // contaminated non-policy turn

    if (isPolicy)        stats.sampleSize.policyOrigins++;
    if (isCleanBaseline) stats.sampleSize.baselineOrigins++;

    const bin = coherenceBin(origin.raw);
    const fd  = origin.forwardDeltas || {};
    for (let k = 1; k <= MAX_LAG; k++) {
      const d = fd[k];
      if (typeof d !== 'number' || !isFinite(d)) continue;
      const key = k + ':' + bin;
      if (isPolicy)             push(policyBuckets,   key, d);
      else if (isCleanBaseline) push(baselineBuckets, key, d);
    }

    if (origin.raw < DRIFT_THRESHOLD) {
      const recovered = typeof origin.recovered === 'number';
      if (isPolicy) {
        stats.recoveryPolicy.total++;
        if (recovered) stats.recoveryPolicy.recovered++;
      } else if (isCleanBaseline) {
        stats.recoveryBaseline.total++;
        if (recovered) stats.recoveryBaseline.recovered++;
      }
    }
  }

  const flush = (
    buckets: Map<Key, number[]>,
    target: { [lag: number]: { [bin in CoherenceBin]: ArmStats } }
  ) => {
    for (let k = 1; k <= MAX_LAG; k++) {
      (['low', 'mid', 'high'] as CoherenceBin[]).forEach(bin => {
        const vals = buckets.get(k + ':' + bin) || [];
        target[k][bin] = {
          n: vals.length,
          meanDelta: mean(vals),
          stdDelta:  sampleStd(vals),
        };
      });
    }
  };
  flush(policyBuckets,   stats.policy);
  flush(baselineBuckets, stats.baseline);

  if (stats.recoveryPolicy.total > 0) {
    stats.recoveryPolicy.rate =
      stats.recoveryPolicy.recovered / stats.recoveryPolicy.total;
  }
  if (stats.recoveryBaseline.total > 0) {
    stats.recoveryBaseline.rate =
      stats.recoveryBaseline.recovered / stats.recoveryBaseline.total;
  }

  return stats;
}

// ── Convenience: flatten for live display ───────────────────────

/**
 * Flattens a ShadowStats into a single-line summary for sidebar readout.
 * Pooled means are sample-size-weighted across all (lag, bin) cells.
 */
export function summarizeShadowStats(s: ShadowStats): ShadowSummary {
  const weighted = (
    map: { [lag: number]: { [bin in CoherenceBin]: ArmStats } }
  ): number | null => {
    let sum = 0, count = 0;
    for (let k = 1; k <= MAX_LAG; k++) {
      (['low', 'mid', 'high'] as CoherenceBin[]).forEach(bin => {
        const a = map[k][bin];
        if (a.n > 0 && a.meanDelta !== null) {
          sum   += a.meanDelta * a.n;
          count += a.n;
        }
      });
    }
    return count > 0 ? sum / count : null;
  };

  return {
    overallPolicyDelta:   weighted(s.policy),
    overallBaselineDelta: weighted(s.baseline),
    policyRecoveryRate:   s.recoveryPolicy.rate,
    baselineRecoveryRate: s.recoveryBaseline.rate,
    policyOriginsN:       s.sampleSize.policyOrigins,
    baselineOriginsN:     s.sampleSize.baselineOrigins,
    canCompare:           s.sampleSize.policyOrigins   >= MIN_COMPARE
                       && s.sampleSize.baselineOrigins >= MIN_COMPARE,
  };
}

// ── Raw extraction (for downstream statistical tests) ───────────

/**
 * Walks entries once, classifying origins by policy / clean-baseline
 * using the same disjointness rule as computeShadowStats, and emits
 * raw forward-delta arrays per (lag, bin) cell — the data that
 * ShadowStats aggregates away.
 *
 * Consumed by sdk/stats.ts::runCellTests for per-cell Mann-Whitney
 * with BH correction.
 */
export function extractRawBuckets<T extends ShadowEntry>(
  entries: T[]
): {
  policy:   { [lag: number]: { [bin in CoherenceBin]: number[] } };
  baseline: { [lag: number]: { [bin in CoherenceBin]: number[] } };
} {
  const initBin = () => ({ low: [] as number[], mid: [] as number[], high: [] as number[] });
  const initLag = () => {
    const out: { [lag: number]: { [bin in CoherenceBin]: number[] } } = {};
    for (let k = 1; k <= MAX_LAG; k++) out[k] = initBin();
    return out;
  };
  const policy   = initLag();
  const baseline = initLag();

  for (let i = 0; i < entries.length; i++) {
    const origin = entries[i];
    const isPolicy = origin.originIsPolicy === true;
    let isCleanBaseline = false;
    if (!isPolicy) {
      isCleanBaseline = true;
      const end = Math.min(i + MAX_LAG, entries.length - 1);
      for (let j = i + 1; j <= end; j++) {
        if (entries[j].originIsPolicy === true) { isCleanBaseline = false; break; }
      }
    }
    if (!isPolicy && !isCleanBaseline) continue;

    const bin = coherenceBin(origin.raw);
    const fd  = origin.forwardDeltas || {};
    for (let k = 1; k <= MAX_LAG; k++) {
      const d = fd[k];
      if (typeof d !== 'number' || !isFinite(d)) continue;
      if (isPolicy)             policy[k][bin].push(d);
      else if (isCleanBaseline) baseline[k][bin].push(d);
    }
  }

  return { policy, baseline };
}

/**
 * Pool all forward deltas across lags and bins into two flat arrays —
 * one for policy origins, one for clean baseline origins — suitable
 * for pooled bootstrap CI on the overall mean difference.
 */
export function extractPooledDeltas<T extends ShadowEntry>(
  entries: T[]
): { policyDeltas: number[]; baselineDeltas: number[] } {
  const buckets = extractRawBuckets(entries);
  const pool = (m: { [lag: number]: { [bin in CoherenceBin]: number[] } }): number[] => {
    const out: number[] = [];
    for (let k = 1; k <= MAX_LAG; k++) {
      (['low', 'mid', 'high'] as CoherenceBin[]).forEach(bin => {
        for (const v of m[k][bin]) out.push(v);
      });
    }
    return out;
  };
  return {
    policyDeltas:   pool(buckets.policy),
    baselineDeltas: pool(buckets.baseline),
  };
}
