/**
 * VECTOR — Volatility-Sensitive Correction Engine
 * SDK: SDE Simulation & Kalman Filter
 * © 2026 Hudson & Perry Research
 *
 * SDE: Time-varying OU + periodic forcing + GARCH-in-Mean + jump-diffusion
 * dε(t) = a(t)ε(t)dt + b dW_t + J dN(λ)
 * a(t) = (α + β·sin(ωt) - δ·σ²(t)) / (1 + κ)
 * b    = σ / (1 + κ)
 *
 * References:
 *   GARCH-in-Mean: Engle, Lilien & Robins (1987)
 *   Jump-diffusion: Merton (1976)
 */

import { KAPPA, SDE_PARAMS, KALMAN_R, KALMAN_SIGMA_P } from './constants';

// ── Types ─────────────────────────────────────────────────────────

export interface SDEParams {
  alpha: number;        // mean reversion rate (negative for stability)
  beta_p: number;       // periodic forcing amplitude
  omega: number;        // periodic forcing frequency (default 2π/12)
  sigma: number;        // base diffusion coefficient
  kappa: number;        // damping constant (0.444 Hudson / 0.500 Standard)
  delta?: number;       // GARCH-in-Mean coupling coefficient (V1.5.39)
  jumpIntensity?: number; // Poisson jump arrival rate λ (V1.5.39)
  jumpMagnitude?: number; // jump size |J| (V1.5.39)
}

export interface KalmanState {
  x: number;  // filtered state estimate (coherence trajectory)
  P: number;  // error covariance
}

export interface SDEPercentiles {
  p10: number;
  p90: number;
}

// ── LCG Random Number Generator ───────────────────────────────────
// Deterministic seed = reproducible bands across renders

function makeRng(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randn(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── SDE Simulation ────────────────────────────────────────────────

/**
 * Simulate Monte Carlo paths of the VECTOR coherence SDE.
 *
 * @param params  SDE parameters (uses SDE_PARAMS defaults if omitted)
 * @param T       Simulation horizon (turns × time step)
 * @param dt      Time step (default 0.02)
 * @param nPaths  Number of Monte Carlo paths (default 50)
 * @param seed    RNG seed for reproducibility (default 42)
 * @returns       Array of Float32Array paths
 */
export function simulateSDE(
  params: Partial<SDEParams> = {},
  T = 20,
  dt = 0.02,
  nPaths = 50,
  seed = 42
): Float32Array[] {
  const p: SDEParams = { ...SDE_PARAMS, ...params };
  const {
    alpha, beta_p, omega, sigma, kappa,
    delta = 0, jumpIntensity = 0, jumpMagnitude = 0,
  } = p;

  const lam = 1 / (1 + kappa);
  const nSteps = Math.ceil(T / dt);
  const rng = makeRng(seed);
  const paths: Float32Array[] = [];
  const jumpProb = 1 - Math.exp(-jumpIntensity * dt);
  let runVar = 0;

  for (let path = 0; path < nPaths; path++) {
    const arr = new Float32Array(nSteps + 1);
    arr[0] = 0;
    for (let i = 1; i <= nSteps; i++) {
      const t = i * dt;
      // GARCH-in-Mean: high variance pushes drift toward mean reversion
      const a_t = lam * (alpha + beta_p * Math.sin(omega * t) - delta * runVar);
      const b = lam * sigma;
      const noise = b * Math.sqrt(dt) * randn(rng);
      const jump = rng() < jumpProb
        ? (rng() > 0.5 ? 1 : -1) * jumpMagnitude
        : 0;
      arr[i] = arr[i - 1] + a_t * arr[i - 1] * dt + noise + jump;
      // Simple EWM variance for GARCH-in-Mean
      runVar = 0.85 * runVar + 0.15 * Math.pow(arr[i] - arr[i - 1], 2);
    }
    paths.push(arr);
  }
  return paths;
}

/**
 * Extract P10/P90 percentile band at a given simulation step.
 */
export function sdePercentilesAtStep(
  paths: Float32Array[],
  step: number
): SDEPercentiles {
  const vals = paths
    .map(p => p[Math.min(step, p.length - 1)])
    .sort((a, b) => a - b);
  const n = vals.length;
  return {
    p10: vals[Math.floor(n * 0.10)],
    p90: vals[Math.floor(n * 0.90)],
  };
}

// ── Kalman Filter ──────────────────────────────────────────────────

/**
 * Single Kalman filter update step.
 *
 * @param state       Current Kalman state {x, P}
 * @param obs         New coherence score observation
 * @param t           Current time (turn × 2π/12)
 * @param params      SDE parameters (for process model F)
 * @param kalR        Observation noise variance (default KALMAN_R)
 * @param kalSigP     Process noise std dev (default KALMAN_SIGMA_P)
 * @param smoothedVar Current GARCH variance (for GARCH-in-Mean, default 0)
 * @returns           Updated Kalman state
 */
export function kalmanStep(
  state: KalmanState,
  obs: number,
  t: number,
  params: Partial<SDEParams> = {},
  kalR = KALMAN_R,
  kalSigP = KALMAN_SIGMA_P,
  smoothedVar = 0
): KalmanState {
  const p: SDEParams = { ...SDE_PARAMS, ...params };
  const { alpha, beta_p, omega, kappa, delta = 0 } = p;
  const lam = 1 / (1 + kappa);
  // GARCH-in-Mean: variance reduces drift under high volatility
  const a_t = lam * (alpha + beta_p * Math.sin(omega * t) - delta * smoothedVar);
  const F = 1 + a_t;
  const Q = Math.pow(kalSigP * lam, 2);
  const x_p = F * state.x;
  const P_p = F * F * state.P + Q;
  const K = P_p / (P_p + kalR);
  return {
    x: x_p + K * (obs - x_p),
    P: (1 - K) * P_p,
  };
}

/**
 * Compute drift law floor — minimum coherence at turn n under harness mode.
 * ΔS = cap_eff × (1 − exp(−n^α_s / τ)) + |β_c · sin(γ_h · n · 0.01)| × 0.05
 */
export function driftLawFloor(
  n: number,
  gamma_h: number,
  epsilon = 0.05,
  alphaS = 1.8,
  betaC = 0.2
): number {
  const capEff = epsilon / (1 + gamma_h);
  const tau = Math.max(0.0225 / epsilon, 1);
  const sys = capEff * (1 - Math.exp(-Math.pow(Math.max(n, 0.001), alphaS) / tau));
  return sys + Math.abs(betaC * Math.sin(gamma_h * n * 0.01)) * 0.05;
}

// ── CIR (Cox-Ingersoll-Ross) ───────────────────────────────────
/**
 * dX = κ(θ−X)dt + σ√X dW  — keeps variance non-negative.
 * Feller condition: 2κθ ≥ σ² guarantees X never reaches zero.
 * @throws Warning in return if Feller condition violated.
 */
export function simulateCIR(
  params: { kappa?: number; theta?: number; sigma?: number } = {},
  T = 20, dt = 0.02, nPaths = 50, seed = 42
): { paths: Float32Array[]; fellerViolation: boolean } {
  const { kappa = 0.444, theta = 0.10, sigma = 0.08 } = params;
  const fellerViolation = 2 * kappa * theta < sigma * sigma;
  const nSteps = Math.ceil(T / dt);
  const rng = makeRng(seed);
  const paths: Float32Array[] = [];
  for (let p = 0; p < nPaths; p++) {
    const path = new Float32Array(nSteps + 1);
    path[0] = theta;
    for (let i = 1; i <= nSteps; i++) {
      const x = Math.max(path[i - 1], 0);
      path[i] = Math.max(x + kappa * (theta - x) * dt + sigma * Math.sqrt(x) * Math.sqrt(dt) * randn(rng), 0);
    }
    paths.push(path);
  }
  return { paths, fellerViolation };
}

// ── Heston Stochastic Volatility ──────────────────────────────
/**
 * dS/S = √V dW₁  |  dV = κ(θ−V)dt + σ√V dW₂  |  corr(dW₁,dW₂) = ρ
 * Uses Full Truncation Euler scheme — eliminates downward bias from
 * simple absorption clamp. Reference: Lord et al. (2010).
 */
export function simulateHeston(
  params: { kappa?: number; theta?: number; sigma?: number; rho?: number; v0?: number } = {},
  T = 20, dt = 0.02, nPaths = 50, seed = 42
): Float32Array[] {
  const { kappa = 2.0, theta = 0.04, sigma = 0.30, rho = -0.70, v0 = 0.04 } = params;
  const nSteps = Math.ceil(T / dt);
  const rng = makeRng(seed);
  const paths: Float32Array[] = [];
  for (let p = 0; p < nPaths; p++) {
    const path = new Float32Array(nSteps + 1);
    path[0] = 0;
    let v = v0;
    for (let i = 1; i <= nSteps; i++) {
      const z1 = randn(rng), z2 = randn(rng);
      const w1 = z1, w2 = rho * z1 + Math.sqrt(1 - rho * rho) * z2;
      // Full Truncation: use v+ inside drift and diffusion
      const vPos = Math.max(v, 0);
      const sqV = Math.sqrt(vPos);
      path[i] = path[i - 1] + sqV * Math.sqrt(dt) * w1;
      v = vPos + kappa * (theta - vPos) * dt + sigma * sqV * Math.sqrt(dt) * w2;
    }
    paths.push(path);
  }
  return paths;
}

// ── Vasicek ────────────────────────────────────────────────────
/**
 * dX = κ(θ−X)dt + σ dW  — allows negative values.
 * Models sessions that go genuinely incoherent below zero.
 */
export function simulateVasicek(
  params: { kappa?: number; theta?: number; sigma?: number } = {},
  T = 20, dt = 0.02, nPaths = 50, seed = 42
): Float32Array[] {
  const { kappa = 0.444, theta = 0.10, sigma = 0.08 } = params;
  const nSteps = Math.ceil(T / dt);
  const rng = makeRng(seed);
  const paths: Float32Array[] = [];
  for (let p = 0; p < nPaths; p++) {
    const path = new Float32Array(nSteps + 1);
    path[0] = theta;
    for (let i = 1; i <= nSteps; i++) {
      path[i] = path[i - 1] + kappa * (theta - path[i - 1]) * dt + sigma * Math.sqrt(dt) * randn(rng);
    }
    paths.push(path);
  }
  return paths;
}

// ── SABR ───────────────────────────────────────────────────────
/**
 * Stochastic Alpha Beta Rho model.
 * dF = σ·F^β dW₁  |  dσ = α·σ dW₂  |  corr(dW₁,dW₂) = ρ
 * Richer volatility surfaces than GARCH + OU.
 * Reference: Hagan et al. (2002).
 */
export function simulateSABR(
  params: { alpha?: number; beta?: number; rho?: number; nu?: number; f0?: number } = {},
  T = 20, dt = 0.02, nPaths = 50, seed = 42
): Float32Array[] {
  const { alpha = 0.30, beta = 1.0, rho = -0.50, nu = 0.40, f0 = 0.08 } = params;
  const nSteps = Math.ceil(T / dt);
  const rng = makeRng(seed);
  const paths: Float32Array[] = [];
  for (let p = 0; p < nPaths; p++) {
    const path = new Float32Array(nSteps + 1);
    path[0] = 0;
    let f = f0, vol = alpha;
    for (let i = 1; i <= nSteps; i++) {
      const z1 = randn(rng), z2 = randn(rng);
      const w1 = z1, w2 = rho * z1 + Math.sqrt(Math.max(1 - rho * rho, 0)) * z2;
      const df = vol * Math.pow(Math.abs(f) + 1e-8, beta) * Math.sqrt(dt) * w1;
      const dvol = nu * vol * Math.sqrt(dt) * w2;
      f = f + df;
      vol = Math.max(vol + dvol, 1e-8);
      path[i] = path[i - 1] + df;
    }
    paths.push(path);
  }
  return paths;
}

// ── Extended Kalman Filter (EKF) ───────────────────────────────
/**
 * Linearizes nonlinear OU dynamics via analytical Jacobian.
 * More accurate than linear Kalman for OU + periodic forcing.
 * F = ∂f/∂x = 1 + a(t)·dt  (vs F = 1 + a(t) in linear Kalman)
 * Reference: Jazwinski (1970).
 */
export function ekfStep(
  state: KalmanState,
  obs: number,
  t: number,
  params: Partial<SDEParams> = {},
  kalR = KALMAN_R,
  kalSigP = KALMAN_SIGMA_P,
  smoothedVar = 0
): KalmanState {
  const p: SDEParams = { ...SDE_PARAMS, ...params };
  const { alpha, beta_p, omega, kappa, delta = 0 } = p;
  const lam = 1 / (1 + kappa);
  const a_t = lam * (alpha + beta_p * Math.sin(omega * t) - delta * smoothedVar);
  const Q = Math.pow(kalSigP * lam, 2);
  const F = 1 + a_t * 0.1; // Jacobian with dt=0.1
  const x_p = state.x + a_t * state.x * 0.1;
  const P_p = F * F * state.P + Q;
  const K = P_p / (P_p + kalR);
  return {
    x: x_p + K * (obs - x_p),
    P: Math.max((1 - K) * P_p, 1e-8),
  };
}

// ── Lévy Flight Noise ──────────────────────────────────────────
/**
 * α-stable noise via Chambers-Mallows-Stuck method.
 * α=2: Gaussian. α=1.7 (default): moderate heavy tail.
 * α=1: Cauchy (very heavy). Models rare large behavioral jumps.
 * Reference: Chambers, Mallows & Stuck (1976).
 */
export function levyNoise(rng: () => number, alpha = 1.7): number {
  if (Math.abs(alpha - 2.0) < 0.01) {
    const u1 = Math.max(rng(), 1e-10), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  const u = (rng() - 0.5) * Math.PI;
  const w = -Math.log(Math.max(rng(), 1e-10));
  const num = Math.sin(alpha * u);
  const den = Math.pow(Math.cos(u), 1 / alpha);
  const factor = Math.pow(Math.cos((1 - alpha) * u) / w, (1 - alpha) / alpha);
  const z = (num / den) * factor;
  return isFinite(z) ? Math.max(-5, Math.min(5, z)) : 0;
}

// ── Path Normalization ─────────────────────────────────────────
/**
 * Normalize SDE paths to zero-mean unit-variance.
 * Required before drift detection when mixing CIR/Heston/Vasicek/SABR
 * with OU — different models have different baseline scales.
 * Q5 fix: prevents false drift events from scale mismatch.
 */
export function normalizePaths(paths: Float32Array[]): Float32Array[] {
  if (!paths || !paths.length) return paths;
  const allVals = paths.flatMap(p => Array.from(p));
  const mean = allVals.reduce((s, v) => s + v, 0) / allVals.length;
  const std = Math.sqrt(allVals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / allVals.length) || 1;
  return paths.map(p => {
    const n = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) n[i] = (p[i] - mean) / std;
    return n;
  });
}

// ── Lyapunov Stability Bound ───────────────────────────────────
/**
 * For OU SDE: stable iff a_max = (α + β_p − δ·σ²)/(1+κ) < 0
 * Margin > 0 means parameters are in stable regime.
 * Reference: Lyapunov (1892); Gardiner (1985).
 */
export interface LyapunovResult {
  stable: boolean;
  a_max: number;
  a_min: number;
  margin: number;
}
export function computeLyapunovBound(
  params: Partial<SDEParams>,
  smoothedVar = 0
): LyapunovResult {
  const { alpha = -0.25, beta_p = 0.18, kappa = 0.444, delta = 0.30 } = params;
  const lam = 1 / (1 + kappa);
  const varTerm = delta * smoothedVar;
  const a_max = lam * (alpha + beta_p - varTerm);
  const a_min = lam * (alpha - beta_p - varTerm);
  const margin = -a_max;
  return { stable: margin > 0, a_max, a_min, margin: parseFloat(margin.toFixed(6)) };
}
