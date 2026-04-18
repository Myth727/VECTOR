# Contributing to VECTOR

Thank you for your interest in contributing to VECTOR — a volatility-sensitive correction engine for sequential generative processes.

---

## What this project is

VECTOR is an active R&D project. The core (PRESETS, FEATURES, MATH tabs) is stable and mathematically validated. The ⚗ Advanced tab contains experimental, unvalidated features clearly labeled as such. Contributions to either layer are welcome.

---

## How to contribute

**Bug reports** — Open an issue describing the behavior, the device and browser, and steps to reproduce.

**Feature suggestions** — Open an issue with the label `enhancement`. Describe the use case, not just the feature.

**Code contributions** — Fork the repo, make your changes, open a pull request. Keep changes surgical — one concern per PR.

**SDK improvements** — The TypeScript SDK is in `/sdk`. If you improve the math, update both the `.ts` file and the corresponding function in `VECTOR.jsx`.

---

## Framing guidelines

- **Standard features** (PRESETS, FEATURES, MATH tabs): claims must be supported by the math or by observable behavior.
- **Advanced/experimental features**: clearly label as experimental. Do not promote experimental results as validated findings.
- **Constants** (κ, stability anchor): framework identity values. Modifications belong in the Advanced tab, clearly labeled.

---

## Validation experiments needed

These cannot be built — they require actual usage data. If you have sessions and want to contribute to validation:

**C-score vs Human Judgment (critical)**
Run 50+ sessions, 10+ turns each. For each turn record C-score, H-SIG, B-SIG, harness mode, preset. Have a human rater label each assistant turn good/acceptable/bad. Compute Pearson/Spearman correlation. Target: r > 0.6.

**H-Signal False Positive Logging**
Use the FALSE+ button in the LOG modal. Log which signal fired and whether the actual output quality warranted it. After 100 labeled examples, compute precision/recall per signal type.

**κ Sensitivity Study**
Run identical sessions with κ at 0.3, 0.4, 0.444, 0.5, 0.6. Compare coherence score distributions, drift event counts, false positive signal rates. This is how κ=0.444 moves from empirically derived to formally validated.

**Incognito vs Normal Mode**
Document H-signal and B-signal counts across matched sessions in normal vs private browsing mode. After 50 paired sessions, report the difference.

---

## V1.7.3 Causal Delta Improvements (logged April 17, 2026)

### R1 — Delay Bias Fix (k=1..5)
Previous A1 logged ΔC_policy only at t+1. External AI audit identified
that injection effects may take 2-3 turns to manifest, making single-step
measurement falsely classify delayed improvements as no-effect.

Fix: kOffset = turn - lastInjectionTurn. Any turn where kOffset ∈ [1,5]
is in the policy window. deltaCPolicyK records which lag k produced the
delta. Sidebar shows delta plus k value.

### R2 — Selection Bias Fix (state binning)
Previous A1 compared policy delta against a flat session rolling mean.
Policy only fires in drifted (low-coherence) states, so E[C|policy] and
the baseline were drawn from different state distributions — an unfair
comparison.

Fix: bin recent history into low (<0.50), mid (0.50–0.75), high (>0.75)
coherence bins. Baseline mean computed only from turns in the same bin
as the current score. Falls back to flat rolling mean when bin is sparse
(<2 turns). Eliminates selection bias by comparing within state regions.

### Shadow Policy — Logged for Phase B
External AI audit suggested adding a shadow policy branch:
  C_shadow = predicted_next_C_without_policy()
This requires a predictive model that does not yet exist.
Logged here as a Phase B target — implement after A2 data exists.

### New coherenceData fields
- deltaCPolicy: ΔC vs binned baseline in policy window (k=1..5)
- deltaCPolicyK: which lag k (1–5) produced the delta
- deltaCBaseline: ΔC vs binned baseline on non-injection turns (control)

---

## Phase A/B Execution Plan (logged April 16, 2026)

Source: External AI audit — Option 3 derivation.
Full A, Q, H, R estimation pipeline for the VECTOR state-space model.

---

### Labeled Sample Format (exact spec)

```
sample_i:
  id: string
  length: T
  observations:
    t: 1…T
    y_t:
      C_t: float       ← coherence score
      sigma2_t: float  ← GARCH variance
      k_t: float       ← Kalman estimate
      H_t: int         ← hallucination signal count
      B_t: int         ← behavioral signal count
  label:
    class: normal | degraded | failure
  metadata:
    domain: string
    source: human | synthetic
```

Label applies to entire session trajectory, NOT per-message.

---

### Minimum Viable Dataset

- Absolute minimum: N=100 sessions, T_avg ≥ 50 turns
- Recommended: N≥300, balanced 100/100/100 normal/degraded/failure
- Synthetic data: allowed for initial estimation and pipeline debugging only
- Synthetic ratio must not exceed 0.50
- Synthetic data NOT valid for final calibration or probability estimation

---

### EM Algorithm — A, Q, H, R Estimation

State-space model:
  x_{t+1} = A x_t + w_t    (w_t ~ N(0,Q))
  y_t     = H x_t + v_t    (v_t ~ N(0,R))

Initialization:
  A₀ = Identity (5x5)
  Q₀ = 0.01 * I
  H₀ = Identity
  R₀ = 0.05 * I

E-step: Run Kalman Filter + RTS Smoother per session
  - Forward: x̂_t|t, P_t|t
  - Backward: x̂_t|T, P_t|T, P_t,t-1|T (cross-covariance)

M-step updates:
  A = (Σ E[x_t x_{t-1}ᵀ]) (Σ E[x_{t-1} x_{t-1}ᵀ])⁻¹
  Q = (1/(T-1)) Σ E[(x_t - A x_{t-1})(x_t - A x_{t-1})ᵀ]
  H = (Σ y_t x_tᵀ)(Σ x_t x_tᵀ)⁻¹
  R = (1/T) Σ (y_t - H x_t)(y_t - H x_t)ᵀ

Iterate E+M until log-likelihood converges. Typical: 10–30 iterations.

Python stack: numpy + pykalman (KalmanFilter.em())

---

### z_t Readiness Criteria

z_t = || W x̂_t || (scalar instability/drift energy)

Do NOT surface z_t on dashboard until ALL THREE are true:
  1. EM converged (ΔlogL < ε)
  2. Residuals ~ white noise
  3. State covariance stable (no explosion)

Before that: z_t is classified as SPECULATIVE SIGNAL.
Minimum viable display: N ≥ 100 sessions + model converged.

---

### Mandatory Enforcement Before Phase C

```python
assert spectral_radius(A) < 1.0   # unstable A = exploding states
assert det(Q) > 0                  # degenerate Q = frozen dynamics
assert det(R) > 0                  # ill-conditioned observation model
```

Fail any check → REJECT MODEL, do not proceed to Phase C.

---

### Failure Modes to Watch

1. Unstable A: eigenvalues > 1 → exploding states
2. Degenerate Q: zero variance → frozen dynamics
3. Ill-conditioned H: unobservable states
4. Overfit to synthetic: zero real-world transfer

---

### Execution Steps

1. Log sessions → JSON format per spec above
2. Build dataset (N ≥ 100 minimum)
3. Run EM → estimate A, Q, H, R
4. Validate residuals + stability (enforce checks)
5. Compute z_t — keep internal, not user-facing yet
6. Expand dataset → Phase C (probability mapping)

---

### Phase C — Probability Mapping (when Phase B complete)

P(failure | x_t) via logistic regression:
  P = σ(βᵀ x_t)  where β learned from labeled data

Upgrade path:
  Level 1: Logistic regression
  Level 2: Gaussian mixture model
  Level 3: Bayesian state estimator

Dashboard must eventually show: z_t, P(failure), confidence interval

---

### Exponential Blending — V1.7.0 (from Q1 resolution)

Replace current linear turnWeight ramp with:
  α(t) = 1 - exp(-t / τ)
  score = α(t) * rawScore * penalty + (1 - α(t)) * prior

Initial τ = 5. Tune against session data.
Strictly dominates both current implementation and the
original suggestion. Smooth continuous transition, no hard cutoff.
Balances G1 (early stabilization) and G2 (anomaly sensitivity).

---

## External Audit Findings (logged April 16, 2026)

Source: External AI deep audit of VECTOR V1.6.0
Status per finding after independent verification:

### CONFIRMED BUGS — fix next session

**Q3 — CIR Feller Condition (CRITICAL)**
No guard at parameter input UI. User can set values violating 2κθ ≥ σ².
The Math.max clamp fixes output but not dynamics — non-ergodic behavior,
variance collapse artifacts. Fix: enforce Feller at slider input, reject
invalid configs with visible warning.

**Q5 — CIR/OU Scale Mismatch (HIGH)**
CIR paths start at theta (~0.10), OU paths start near 0. Shared drift
formula lo_band = kalman.x + pcts.p10 * 0.15 produces different meanings
per model. Causes false drift events under CIR. Fix: normalize all
processes z_norm = (z - μ_process) / σ_process before percentile calc.

**Q6 — RLHF Bridge Gate (DESIGN FLAW)**
RLHF→SDE adaptation gated on adaptiveSigmaOn. These are orthogonal
concerns — RLHF feedback should not be silenced when sigma adaptation
is off. Creates a hidden dead zone. Fix: decouple RLHF update from
sigma adaptation toggle entirely.

**Q7 — Demo Baseline Contamination (INVALID EVALUATION)**
sendDemoBaseline scores against full VECTOR-corrected session history.
This is data leakage — the comparison is not independent. Fix: score
baseline against user messages only, no corrected assistant turns.

### CONFIRMED ISSUES — medium priority

**Q4 — Heston Euler-Maruyama Absorption Bias (MEDIUM)**
Math.max(..., 0) clamp introduces known downward bias in variance.
Percentile bands shrink, drift threshold tightens artificially.
Fix: implement Full Truncation scheme or QE (Quadratic Exponential)
method. Not critical for display use case but affects research validity.

**Q8 — Unbounded In-Memory Growth (PERFORMANCE)**
Storage capped at 200 turns, in-memory arrays uncapped. Estimated
500–1000 turns before visible mobile lag. Fix: ring buffer on
coherenceData, eventLog, scoreHistory in-memory. Low priority until
long-session use cases emerge.

### PUSHED BACK — not bugs

**Q1 — Bayesian Prior Order (CURRENT ORDER IS CORRECT)**
Audit suggested: apply prior first, then repetition penalty.
Verified: this would produce 0.458 vs current 0.695 at turn 1 with
a repetitive early response — MORE punishing, not less. The prior's
purpose is to protect early sessions from noisy scores. Applying
penalty after the prior blend would defeat that purpose entirely.
Current order (penalty → prior blend) is mathematically correct for
the stated intent. No change needed.

**Q2 — GARCH Entropy Timing (NOT A BUG)**
Verified in sendMessage: hallucinationAssessment computed at SM line 198,
updateSmoothedVariance called at SM line 303. Entropy is from the
current turn's content, passed directly. Not stale. The concern
was valid to raise, implementation is correct.

### SYSTEM-LEVEL FINDINGS — all valid, all acknowledged

- No unified state model across Kalman + GARCH + SDE + TF-IDF
- No calibration pipeline (P(failure | signal) unmeasured)
- No ground truth loop (no labeled failures, no ROC curves)
- AUC > 0.8 required before Level 1 credibility claim
- GARCH on semantic drift: speculative, may work empirically, unproven

These are in CONTRIBUTING.md validation experiments section.
No pushback. All correct.

---

## StableDRL Integration (logged April 16, 2026)

**Source:** Li, X. (@sheriyuo). *Why do dLLMs tend to collapse in RL.* X/Twitter, April 15, 2026. Covers the StableDRL paper on stabilizing RL for diffusion language models.

**Grok's observation:** Strong parallel between StableDRL's problem (noisy importance ratios destabilizing RL updates) and VECTOR's problem (noisy coherence proxy scores creating over-correction feedback loops). Suggested adapting StableDRL's two core methods directly into VECTOR's scoring and injection pipeline.

**The parallel:**

| StableDRL (dLLM training) | VECTOR (inference correction) |
|---|---|
| Noisy importance ratio proxy | Noisy TF-IDF+JSD coherence score |
| Gradient spike | Variance spike → false drift event |
| Policy drift | Harness escalation (AUDIT→EXTREME) |
| Positive feedback loop | Drift → escalation → behavior change → more volatility → more drift |
| Unconditional clipping | Hard-cap JSD contribution before weighted sum |
| Self-normalization by batch | Scale pipe injection by rolling sum of clipped scores |

**Planned implementations:**

**1. Unconditional JSD/Score Clipping** (priority: high)
Remove conditional triggers in coherence scoring. Instead of only capping extreme values when certain thresholds are hit, unconditionally hard-cap the JSD contribution and raw variance ratios before they reach the weighted sum. Treats every volatility signal as a proxy with inherent error.

```javascript
// In computeCoherence — before weighted sum
const jsdCapped = Math.min(jsdScore, JSD_CLIP_MAX); // unconditional, no trigger
const varRatioCapped = Math.min(rawVar / prevVar, VAR_RATIO_CLIP); // unconditional
```

**2. Self-Normalizing Pipe Injection** (priority: medium)
Replace fixed γ values per harness mode (AUDIT=0.05, MODERATE=50, DEEP=5000, EXTREME=10000) with correction magnitudes that normalize by the rolling sum of clipped scores in the live window. When scores are uniformly noisy, correction scales down automatically instead of escalating.

```javascript
// In buildPipeInjection
const windowSum = scoreHistory.slice(-8).reduce((s,v) => s + Math.min(v, CLIP_MAX), 0);
const selfNormGamma = baseGamma / Math.max(windowSum, NORM_FLOOR);
```

**3. StableDRL Mode Toggle** (priority: low)
Add as optional toggle in FEATURES tab → PHYSICS & CONTROL MODULES. Default OFF. When ON, enables both unconditional clipping and self-normalizing injection simultaneously.

**Expected benefit:** Prevents over-correction feedback loops in long sessions (addresses Q8 from code review). Reduces false positive H-signal and drift event cascades on sudden topic changes (validates against GARCH entropy regularization already in place). Improves inference robustness without adding parameters.

---

## Planned Mathematical Extensions

The following are logged for implementation. Contributions welcome.

### Control Theory
- **PID Controller on variance** — Proportional-Integral-Derivative applied to smoothedVar. Pipe injection is currently P-only. Adding I (accumulated error history) and D (rate of variance change) makes correction smoother and less prone to oscillation.
- **Extended Kalman Filter (EKF)** — linearizes nonlinear dynamics at each step. Complements UKF for certain signal profiles.
- **Particle Filter (Sequential Monte Carlo)** — non-parametric, handles non-Gaussian and multimodal drift. More expensive but handles chaotic sessions better than any Kalman variant.
- **Lyapunov Stability Bound** — live readout of whether current SDE parameters guarantee convergence. α < 0 implies stability but surfacing this as a live metric is novel.

### Physics / Spintronics
- **Lévy Flight noise** — heavier-tailed than Langevin, models rare large behavioral jumps. Complements jump-diffusion (Poisson) with continuous heavy-tail distribution.
- **Berry Phase Accumulation** — geometric phase from closed loops in parameter space. Did the session trajectory return to its origin coherence state?
- **Spin Hall Effect coupling** — scalar simplification of skyrmion topological charge dynamics. Precursor to full WASM skyrmion simulation.

### Quantitative Finance
- **Vasicek Model** — like CIR but allows negative values. Models sessions that go genuinely incoherent.
- **SABR Model** — Stochastic Alpha Beta Rho. Richer volatility surfaces than current GARCH + SDE.
- **Realized Volatility** — rolling squared returns, faster-reacting variance complement to GARCH.

### Information Theory
- **Mutual Information between turns** — stronger than JSD for detecting statistical independence between response and conversation.
- **Kolmogorov Complexity proxy** — LZ compression ratio as information density measure. Runs in-browser.
- **Fisher Information** — rate of change in response distribution per turn. Spike = sudden shift.

---

## What we're looking for

- Validation data (see above — this is the highest priority)
- Performance improvements (render optimization, memoization)
- Mobile UX improvements (Android, iOS Safari)
- New validated coherence metrics
- Better RAG retrieval strategies
- SDK test coverage
- Before/after demo mode (same prompt with and without harness — side-by-side display)
- MCP server: expose VECTOR as an MCP tool for Claude Code sessions
- WASM skyrmion simulation integration (long-term)
- Poole Manifold CA extensions (3D rendering, larger grid sizes, animated step mode)
- Circuit Benchmark improvements (additional logic gate tests beyond full adder)
- MHT Study extensions (additional SDE models, empirical validation)

---

## What we're not looking for right now

- Changes that remove experimental warning banners in the Advanced tab
- Claims that any experimental feature has been empirically validated without data
- Breaking changes to the `vector_config` storage schema without a migration path
- Splitting `VECTOR.jsx` into multiple files — the single-file constraint is intentional

---

## Code style

- Single file for the artifact (`VECTOR.jsx`) — no splitting
- Surgical patches — read the surrounding code before touching anything
- No template literals in JSX attributes — use string concatenation
- No raw `localStorage` calls — use `_storageSet`/`_storageGet`/`_storageDel`
- Version bump on any functional change
- Comment any non-obvious math
- Both `VECTOR.jsx` (root) and `components/VECTOR.jsx` must stay identical

---

## Contact

𝕏 @RaccoonStampede (David Hudson) · @Prosperous727 (David Perry)

MIT Licensed — fork freely.
