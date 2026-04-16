/**
 * VECTOR SDK — GARCH & DRIFT LAW
 *
 * GARCH(1,1): sigma2_t = omega + alpha * eps2_{t-1} + beta * sigma2_{t-1}
 * Drift Law:  deltaS = cap_eff * (1 - exp(-n^alpha_s / tau))
 *                    + |beta_C * sin(gamma_h * n * 0.01)| * 0.05
 *
 *   - updateSmoothedVariance takes optional cfg param — reads per-preset
 *     GARCH omega/alpha/beta. Falls back to module-level defaults.
 *     Previously all presets silently used DEFAULT GARCH regardless.
 *   - driftLawCapEff and driftLawFloor take optional epsilon param —
 *     defaults to EPSILON (0.05). Allows mathEpsilon user-tuning to
 *     propagate through to chart floor bands and cap_eff display.
 */

import {
  GARCH_OMEGA, GARCH_ALPHA, GARCH_BETA,
  EPSILON, BETA_C, ALPHA_S,
  type PresetConfig,
} from './constants';

// ── GARCH variance ──────────────────────────────────────────────

/**
 * Update smoothed variance using GARCH(1,1) blended with rolling window.
 * Early turns use rolling window; blends toward GARCH as history grows.
 *
 * @param history  Score history array
 * @param prev     Previous smoothed variance (null on first call)
 * @param cfg      Optional preset config — uses cfg.garchOmega/Alpha/Beta
 *                 when provided. Falls back to module-level defaults.
 */
export function updateSmoothedVariance(
  history: number[],
  prev: number | null,
  cfg?: Partial<PresetConfig>,
): number {
  if (history.length < 2) return prev ?? 0;

  const recent  = history.slice(-20);
  const mean    = recent.reduce((s, v) => s + v, 0) / recent.length;
  const rawVar  = recent.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / recent.length;
  if (prev === null) return rawVar;

  const lastVal = history[history.length - 1];
  const eps2    = Math.pow(lastVal - mean, 2);

  // Per-preset GARCH params — fall back to module defaults when cfg absent
  const gO = cfg?.garchOmega ?? GARCH_OMEGA;
  const gA = cfg?.garchAlpha ?? GARCH_ALPHA;
  const gB = cfg?.garchBeta  ?? GARCH_BETA;

  const garch  = gO + gA * eps2 + gB * prev;
  const weight = Math.min(history.length / 10, 1);
  return weight * garch + (1 - weight) * rawVar;
}

// ── Drift Law ───────────────────────────────────────────────────

/**
 * Effective cap from gamma_h.
 * cap_eff = epsilon / (1 + gamma_h)
 *
 * @param gamma_h  Harness mode gamma value
 * @param epsilon  Ghost tax floor (default EPSILON = 0.05)
 *                 Pass mathEpsilon for user-tuned values.
 */
export function driftLawCapEff(gamma_h: number, epsilon = EPSILON): number {
  return epsilon / (1 + gamma_h);
}

/**
 * Drift Law floor at turn n.
 * deltaS = cap_eff * (1 - exp(-n^alpha_s / tau))
 *        + |beta_C * sin(gamma_h * n * 0.01)| * 0.05
 *
 * @param n        Turn number
 * @param gamma_h  Harness mode gamma value
 * @param epsilon  Ghost tax floor (default EPSILON = 0.05)
 */
export function driftLawFloor(n: number, gamma_h: number, epsilon = EPSILON): number {
  const ce  = driftLawCapEff(gamma_h, epsilon);
  const tau = Math.max(0.0225 / epsilon, 1);
  const sys = ce * (1 - Math.exp(-Math.pow(Math.max(n, 0.001), ALPHA_S) / tau));
  return sys + Math.abs(BETA_C * Math.sin(gamma_h * n * 0.01)) * 0.05;
}

// ── Stability Convergence ───────────────────────────────────────

/**
 * Iterative convergence toward RESONANCE_ANCHOR.
 * val += (anchor - val) * damping * agape_stab
 *
 * Up to maxIter (default 200) synchronous iterations.
 * Wrap in useMemo in React contexts — this is a blocking loop.
 */
export function applyZeroDriftLock(
  cur: number,
  anchor: number,
  maxIter  = 200,
  damping  = 1 / (1 + 0.444),
  agape    = 0.1,
  halo     = 0.0004 * (1 + 0.30),
): { val: number; locked: boolean; iters: number; residual: number } {
  let val = cur;
  let iters = 0;
  for (let i = 0; i < maxIter; i++) {
    if (Math.abs(val - anchor) < halo) { iters = i; break; }
    val  += (anchor - val) * damping * agape;
    iters = i + 1;
  }
  return {
    val,
    locked:   Math.abs(val - anchor) < halo,
    iters,
    residual: Math.abs(val - anchor),
  };
}

// ── PID Controller on Variance ────────────────────────────────
/**
 * Classical P-I-D applied to smoothedVar as process variable.
 * Output > 2.0 indicates over-correction risk — harness should escalate.
 * Reference: Åström & Hägglund (1995).
 */
export interface PIDResult {
  p: number; i: number; d: number; output: number; error: number;
}
const PID_KP = 1.20, PID_KI = 0.08, PID_KD = 0.40, PID_TARGET = 0.080;

export function computePIDCorrection(varHistory: number[]): PIDResult {
  if (!varHistory || varHistory.length < 2)
    return { p: 0, i: 0, d: 0, output: 0, error: 0 };
  const current = varHistory[varHistory.length - 1];
  const prev    = varHistory[varHistory.length - 2];
  const error   = current - PID_TARGET;
  const p       = PID_KP * error;
  const window  = varHistory.slice(-8);
  const integral = window.reduce((s, v) => s + (v - PID_TARGET), 0) / window.length;
  const i       = Math.max(-1.0, Math.min(1.0, PID_KI * integral));
  const d       = PID_KD * (current - prev);
  const output  = Math.max(0, Math.min(3.0, 1.0 + p + i + d));
  return { p, i, d, output, error };
}

// ── Realized Volatility ───────────────────────────────────────
/**
 * Rolling squared returns — faster-reacting complement to GARCH.
 * RV_t = (1/n) Σ (score[i] − score[i−1])²
 * Reference: Andersen & Bollerslev (1998).
 */
export function computeRealizedVolatility(
  scoreHistory: number[],
  window = 8
): number | null {
  if (scoreHistory.length < 3) return null;
  const recent = scoreHistory.slice(-Math.min(window, scoreHistory.length));
  if (recent.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++)
    returns.push(Math.pow(recent[i] - recent[i - 1], 2));
  return returns.reduce((s, v) => s + v, 0) / returns.length;
}

// ── StableDRL Clipping ────────────────────────────────────────
/**
 * Unconditional score clipping + self-normalizing variance scaling.
 * Prevents over-correction feedback loops by treating every proxy
 * signal as having inherent error.
 * Reference: Li et al. (2026) StableDRL, arXiv (via @sheriyuo).
 */
const SDRL_VAR_CLIP   = 3.0;
const SDRL_JSD_CLIP   = 0.85;
const SDRL_NORM_FLOOR = 0.50;
const SDRL_NORM_WIN   = 8;

export function stabledrlClipScore(
  rawScore: number,
  prevScore: number | null
): number {
  if (prevScore == null || prevScore < 0.01) return rawScore;
  const ratio = rawScore / prevScore;
  let clipped = rawScore;
  if (ratio > SDRL_VAR_CLIP) clipped = prevScore * SDRL_VAR_CLIP;
  if (ratio < 1 / SDRL_VAR_CLIP) clipped = prevScore / SDRL_VAR_CLIP;
  return Math.min(Math.max(clipped, 0.30), 0.99);
}

export function stabledrlNormalizeVar(
  smoothedVar: number,
  scoreHistory: number[]
): number {
  if (scoreHistory.length < 2) return smoothedVar;
  const win = scoreHistory.slice(-SDRL_NORM_WIN);
  const clippedSum = win.reduce((s, v) => s + Math.min(v, SDRL_JSD_CLIP), 0);
  const normFactor = Math.max(clippedSum / win.length, SDRL_NORM_FLOOR);
  return smoothedVar / normFactor;
}
