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
