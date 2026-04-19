/**
 * VECTOR SDK — Reliability & Failure Probability
 * © 2026 Hudson & Perry Research · MIT License
 *
 * Classical reliability-engineering formulas that formalize the
 * intuition behind coherence monitoring: as a sequential system
 * runs for more turns, the cumulative probability of at least one
 * failure approaches 1 unless the per-turn failure rate is zero.
 *
 * Two tiers of formulas:
 *
 *   NORMAL TIER — proven reliability math, safe for analytical readouts:
 *
 *     probFailureN(p, n)        P(failure in n trials) = 1 − (1−p)^n
 *                               Murphy's "infinity formula"
 *                               (Feller 1968; standard reliability text).
 *
 *     totalProbability(pAgB,pB) P(A) = Σᵢ P(A|Bᵢ)·P(Bᵢ)
 *                               Law of Total Probability.
 *                               Used here to fuse per-bin failure rates
 *                               with bin occupancy weights.
 *
 *     nForTargetFailure(p, q)   Minimum n such that P(failure) ≥ q
 *                               given per-trial failure rate p.
 *                               Diagnostic: "how many turns until drift
 *                               is at least q-probable given rate p?"
 *
 *     componentFailureAny(ps)   P(at least one component fails) for a
 *                               series system with independent
 *                               per-component probs ps.
 *                               1 − Πᵢ (1 − pᵢ).
 *
 *     estimatePerTurnRate(k,n)  Bayesian-flat MLE of per-turn failure
 *                               rate: (k+1)/(n+2), Laplace smoothing.
 *                               Safer than k/n when n is small.
 *
 *   ADVANCED / EXPLORATORY TIER — satirical, philosophical, or unvalidated;
 *   gated behind consent in VECTOR UI (same pattern as MHT / Poole CA):
 *
 *     sodsLawScore(...)         Wiseman 2004 / British Association formula.
 *                               ((U+C+I)×(10−S))/20 · A · 1/(1−sin(F/10))
 *                               Closer to 10 = higher Sod's-Law risk.
 *                               NOT a reliability metric — a playful
 *                               diagnostic from popular-science coverage.
 *
 *     entropyDriftNarrative(s, prior)
 *                               Informal framing of ΔS_universe > 0
 *                               (Second Law of Thermodynamics) as a
 *                               narrative metaphor for coherence decay.
 *                               Returns ΔS = s − prior plus a text label.
 *                               Display-only, not a causal claim.
 *
 * None of the normal-tier formulas replace existing scoring. They are
 * additional diagnostic surfaces alongside the coherence chart.
 * None of the advanced-tier formulas are calibrated physics — they
 * exist as explicit consent-gated exploration, same posture as
 * featMHTStudy and featPoole.
 *
 * References:
 *   Feller, W. (1968). An Introduction to Probability Theory, Vol I.
 *   Wiseman, R. (2004). "Sod's Law" calculator, coverage in SMH
 *     (Sydney Morning Herald) and Testbook / Quora compilations.
 *   Murphy's-Law formulations: Mathematics Stack Exchange discussions
 *     of probability theorem variants; engineering reliability texts.
 */

// ── Types ────────────────────────────────────────────────────────

export interface FailureProbResult {
  pFailure:  number;   // 1 − (1−p)^n
  pSurvival: number;   // (1−p)^n
  p:         number;   // echoed input
  n:         number;
}

export interface NForTargetResult {
  n:           number | null;  // null if p=0 (never reaches) or q ≤ 0 (trivial)
  p:           number;
  q:           number;
  exact:       boolean;         // true if analytic ceiling used
}

export interface SodsLawInput {
  urgency:     number;  // U ∈ [1, 9]
  complexity:  number;  // C ∈ [1, 9]
  importance:  number;  // I ∈ [1, 9]
  skill:       number;  // S ∈ [1, 9]   — higher S = lower risk
  aggravation: number;  // A ∈ [1, 9]
  frequency:   number;  // F ∈ [1, 9]
}

export interface SodsLawResult {
  score:       number;
  normalized:  number;          // clipped to [0, 10]
  band:        'low' | 'medium' | 'high' | 'very-high';
  note:        string;
}

export interface EntropyNarrativeResult {
  deltaS:      number;          // s − prior
  direction:   'increasing' | 'decreasing' | 'stable';
  note:        string;
}

// ── Constants ────────────────────────────────────────────────────

export const SODS_LAW_MIN   = 1;
export const SODS_LAW_MAX   = 9;
export const SODS_LAW_CAP   = 10;   // display ceiling

// ── Normal tier ──────────────────────────────────────────────────

/**
 * Murphy's infinity formula. Per-trial failure probability p ∈ [0,1];
 * after n independent trials, P(at least one failure) = 1 − (1−p)^n.
 *
 * Assumes per-trial independence. Real conversations are positively
 * autocorrelated, so in practice this is an UPPER BOUND on drift
 * probability when failures cluster (which they typically do).
 */
export function probFailureN(p: number, n: number): FailureProbResult {
  const pC = Math.max(0, Math.min(1, isFinite(p) ? p : 0));
  const nC = Math.max(0, Math.floor(isFinite(n) ? n : 0));
  const pSurvival = Math.pow(1 - pC, nC);
  return {
    pFailure:  1 - pSurvival,
    pSurvival,
    p: pC,
    n: nC,
  };
}

/**
 * Law of Total Probability on a discrete partition.
 *
 * P(A) = Σᵢ P(A|Bᵢ) · P(Bᵢ)
 *
 * `pAgivenB` and `pB` must be same length. pB need not sum exactly to 1
 * (empirical bin weights may drift slightly); result is clamped to [0,1].
 */
export function totalProbability(
  pAgivenB: number[],
  pB:       number[]
): number {
  if (pAgivenB.length !== pB.length || pAgivenB.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < pAgivenB.length; i++) {
    const a = isFinite(pAgivenB[i]) ? pAgivenB[i] : 0;
    const b = isFinite(pB[i])       ? pB[i]       : 0;
    acc += Math.max(0, Math.min(1, a)) * Math.max(0, Math.min(1, b));
  }
  return Math.max(0, Math.min(1, acc));
}

/**
 * Minimum n such that P(failure over n trials) ≥ q, given per-trial p.
 *
 * Solve 1 − (1−p)^n ≥ q for the smallest integer n:
 *   (1−p)^n ≤ 1 − q
 *   n · ln(1−p) ≤ ln(1−q)
 *   n ≥ ln(1−q) / ln(1−p)    (note both logs are negative so inequality flips)
 *
 * Edge cases:
 *   p = 0: returns null (will never reach any q > 0)
 *   q ≤ 0: returns 0 (trivially already achieved)
 *   q ≥ 1: returns null (only reachable asymptotically)
 */
export function nForTargetFailure(p: number, q: number): NForTargetResult {
  const pC = Math.max(0, Math.min(1, isFinite(p) ? p : 0));
  const qC = Math.max(0, Math.min(1, isFinite(q) ? q : 0));
  if (qC <= 0) return { n: 0, p: pC, q: qC, exact: true };
  if (qC >= 1) return { n: null, p: pC, q: qC, exact: true };
  if (pC <= 0) return { n: null, p: pC, q: qC, exact: true };
  if (pC >= 1) return { n: 1,    p: pC, q: qC, exact: true };
  const n = Math.ceil(Math.log(1 - qC) / Math.log(1 - pC));
  return { n, p: pC, q: qC, exact: true };
}

/**
 * Series-system failure probability across independent components:
 *   P(any fail) = 1 − Πᵢ (1 − pᵢ)
 * Each pᵢ is clamped to [0,1].
 */
export function componentFailureAny(ps: number[]): number {
  if (!ps || ps.length === 0) return 0;
  let survival = 1;
  for (const raw of ps) {
    const p = Math.max(0, Math.min(1, isFinite(raw) ? raw : 0));
    survival *= (1 - p);
  }
  return 1 - survival;
}

/**
 * Laplace-smoothed (Bayesian flat prior) estimate of per-trial failure
 * rate given k failures observed in n trials.
 *
 * rate = (k + 1) / (n + 2)
 *
 * Safer than k/n when n is small. Returns 0.5 when n = 0.
 */
export function estimatePerTurnRate(k: number, n: number): number {
  const kC = Math.max(0, Math.floor(isFinite(k) ? k : 0));
  const nC = Math.max(0, Math.floor(isFinite(n) ? n : 0));
  if (kC > nC) return 1;
  return (kC + 1) / (nC + 2);
}

// ── Advanced tier (consent-gated in UI) ──────────────────────────

/**
 * Sod's Law (Wiseman 2004). All inputs on a 1–9 integer scale; not a
 * physical measurement. Returned score is clipped to [0, 10] for display
 * and labeled by band. The raw formula can diverge as F → 9 because of
 * 1/(1 − sin(F/10)); we cap it for sanity.
 *
 *   raw = ((U + C + I) × (10 − S)) / 20  ×  A  ×  1 / (1 − sin(F/10))
 *
 * Bands (on the clipped 0–10 scale):
 *   < 2.5   low
 *   < 5.0   medium
 *   < 7.5   high
 *   ≥ 7.5   very-high
 */
export function sodsLawScore(input: SodsLawInput): SodsLawResult {
  const clamp = (v: number) => {
    const x = isFinite(v) ? v : SODS_LAW_MIN;
    return Math.max(SODS_LAW_MIN, Math.min(SODS_LAW_MAX, x));
  };
  const U = clamp(input.urgency);
  const C = clamp(input.complexity);
  const I = clamp(input.importance);
  const S = clamp(input.skill);
  const A = clamp(input.aggravation);
  const F = clamp(input.frequency);

  const base    = ((U + C + I) * (10 - S)) / 20;
  const sinTerm = Math.sin(F / 10);
  const denom   = 1 - sinTerm;
  // Guard against F so close to 10 (rad interpretation) that denom → 0.
  const safeDenom = Math.abs(denom) < 1e-3 ? 1e-3 * Math.sign(denom || 1) : denom;
  const raw = base * A * (1 / safeDenom);

  const normalized = Math.max(0, Math.min(SODS_LAW_CAP, raw));
  let band: SodsLawResult['band'];
  if      (normalized < 2.5) band = 'low';
  else if (normalized < 5.0) band = 'medium';
  else if (normalized < 7.5) band = 'high';
  else                       band = 'very-high';

  const note = 'Sod\'s Law is a satirical pop-science formula (Wiseman 2004), '
             + 'not a calibrated reliability model. Use for narrative only.';
  return { score: raw, normalized, band, note };
}

/**
 * Second-Law-of-Thermodynamics narrative wrapper on scalar drift.
 * Returns ΔS = s − prior with a direction label and a note making
 * explicit that this is metaphor, not a thermodynamic claim.
 */
export function entropyDriftNarrative(
  s:     number,
  prior: number
): EntropyNarrativeResult {
  const a = isFinite(s)     ? s     : 0;
  const b = isFinite(prior) ? prior : 0;
  const deltaS = a - b;
  let direction: EntropyNarrativeResult['direction'];
  if      (deltaS >  1e-6) direction = 'increasing';
  else if (deltaS < -1e-6) direction = 'decreasing';
  else                     direction = 'stable';
  const note = 'Narrative framing only — ΔS_universe > 0 is the thermodynamic '
             + 'Second Law, used here as metaphor for coherence decay.';
  return { deltaS, direction, note };
}
