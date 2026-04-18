/**
 * VECTOR SDK — Per-Turn Metrics Module
 * © 2026 Hudson & Perry Research · MIT License
 *
 * Per-turn metrics that sit alongside the core coherence score and
 * signal detectors. All are proxy indicators — none validated against
 * labeled human rater data at scale.
 *
 * Previously these lived only in VECTOR.jsx, leaving the SDK behind
 * the main artifact. Fixed in V1.8.1 as part of the parity audit.
 */

import { tokenize, tfidfSimilarity, getTextFromContent } from './coherence';
import type { Message } from './coherence';
import type { KalmanState } from './sde';

// ── Semantic Anchor Distance ──────────────────────────────────
/**
 * TF-IDF similarity between the current response and the first 3
 * assistant turns of the session ("anchor"). Slow-burn drift proxy —
 * catches responses that have drifted from the session's original
 * vocabulary frame, even when recent-turn coherence still looks healthy.
 *
 * Returns null when fewer than 4 assistant turns exist (anchor unstable).
 */
export function computeAnchorDistance(
  responseText: string,
  history:      Message[],
): number | null {
  const ah = history.filter(m => m.role === 'assistant');
  if (ah.length < 4) return null; // need enough turns before anchor matters
  const anchorText = ah.slice(0, 3)
    .map(m => getTextFromContent(m.content))
    .join(' ');
  const anchorTokens = tokenize(anchorText);
  const respTokens   = tokenize(responseText);
  if (!anchorTokens.length || !respTokens.length) return null;
  return tfidfSimilarity(respTokens, anchorTokens);
}

// ── Kalman Innovation Autocorrelation ─────────────────────────
/**
 * If the Kalman filter is correctly specified, the innovation sequence
 * (observed − predicted) should be white noise — uncorrelated across turns.
 * Lag-1 autocorrelation |r| > 0.5 indicates serial correlation =
 * model misspecification (process or noise model wrong).
 *
 * Reference: Box & Jenkins (1970), standard Kalman validation procedure.
 */
export function computeInnovationAutocorrelation(
  scoreHistory:  number[],
  kalmanHistory: Array<KalmanState | null | undefined>,
): number | null {
  if (!kalmanHistory || kalmanHistory.length < 5 || scoreHistory.length < 5) return null;
  const n = Math.min(scoreHistory.length, kalmanHistory.length);

  const innov: number[] = [];
  for (let i = 0; i < n; i++) {
    innov.push(scoreHistory[i] - (kalmanHistory[i]?.x ?? scoreHistory[i]));
  }

  const mean = innov.reduce((s, v) => s + v, 0) / innov.length;
  let cov = 0, variance = 0;
  for (let i = 1; i < innov.length; i++) {
    cov      += (innov[i] - mean) * (innov[i - 1] - mean);
    variance += Math.pow(innov[i] - mean, 2);
  }
  variance += Math.pow(innov[0] - mean, 2);
  return variance === 0 ? 0 : cov / variance;
}

// ── Token Budget Efficiency Ratio ─────────────────────────────
/**
 * Response information density relative to length.
 * Ratio: entropy / log₂(wordCount), normalized so 1.0 ≈ optimal.
 *   < 0.4 = long response with low information (padding/filler)
 *   > 1.2 = dense, efficient response
 *
 * Especially useful for MEDICAL/CIRCUIT presets where precision-per-token
 * matters. Returns null for responses under 5 words or zero-entropy input.
 */
export function computeEfficiencyRatio(
  text:    string,
  entropy: number,
): number | null {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 5 || entropy <= 0) return null;
  const lenNorm = Math.log2(Math.max(wordCount, 2));
  return lenNorm > 0 ? entropy / lenNorm : null;
}

// ── Re-exports from signals.ts for discoverability ────────────
// These already exported from signals.ts; also surfaced here so
// consumers can import "per-turn metrics" from a single module.
export { computeResponseEntropy, computeVocabGrowthRate } from './signals';
