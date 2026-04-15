# CHANGELOG — VECTOR

All notable changes to VECTOR will be documented here.

---

## Historical Reference

VECTOR is a ground-up redesign and rename of the original ARCHITECT project.  
Full development history from ARCHITECT V1.0 through V2.3 is preserved at:

**[github.com/Myth727/ARCHITECT-Universal-Coherence-Engine](https://github.com/Myth727/ARCHITECT-Universal-Coherence-Engine)**

---

## [1.5.3] — 2026-04-15

### Deep Audit — Full Systematic Fix Pass

**Root cause confirmed (V1.5.2 continuation):** Setter functions were present in `JSON.stringify()` config save across the entire file, not just the two reported toggles. The previous fix only patched the surface — this pass did a full sweep.

**All config saves audited and cleaned:**
- `vector_config` save: all setter functions removed. Only state values serialized.
- All other `_storageSet` calls verified clean.

**Config restore gaps fixed:**
- `autoTuneEnabled`, `caPassRate`, `domainAnchor`, `lastAutoTune` were saved but never restored. Added restore handlers for all four — these settings were silently resetting to defaults on every reload.

**TuneModal context audit:**
- `setDisplayPrefs`, `setOn`, `setRewindConfirm` flagged by audit — confirmed legitimate non-context uses (local state, loop var, prop). Not bugs.
- All other setters used in TuneModal confirmed present in TuneCtx.

---

## [1.5.2] — 2026-04-15

### Bug Fix (root cause of stuck toggles)
- **Setter functions serialized into config save** — `setSdeAlphaVal`, `setMtjEnabled`, `setMtjDelta`, `setSdeSigmaOn` and others were accidentally included in the `JSON.stringify()` config save. `JSON.stringify` silently drops function values, corrupting the saved object. On restore, `mtjEnabled` and similar state was being read back as `undefined`, overwriting the `useState(true)` default with falsy. This is why Langevin and Integrity Floor appeared stuck — they were being reset to false on every load. All setters removed from config save and from tuneCtxValue deps array.

---

## [1.5.1] — 2026-04-15

### Bug Fixes
- **Langevin noise toggle stuck OFF** — `setMtjEnabled` and `setMtjDelta` were missing from `tuneCtxValue` object. Toggle rendered but had no setter. Fixed.
- **Integrity Floor toggle stuck OFF** — `setFeatIntegrityFloor`, `setShowIntegrityFloor`, `setIntegrityThreshold` missing from `tuneCtxValue` object. Same root cause. Fixed.
- **SDE param sliders unresponsive** — `setSdeAlphaVal`, `setSdeBetaVal`, `setSdeSigmaVal` and their on/off toggles missing from context value. Fixed.
- Full audit of TuneModal destructuring vs tuneCtxValue — all mismatches resolved.

---

## [1.5.0] — 2026-04-15

### Meta-Harness Integration
*Adapted from Lee, Nair, Zhang, Lee, Khattab & Finn (2026). Meta-Harness: End-to-End Optimization of Model Harnesses. Stanford IRIS Lab. arXiv:2603.28052.*

**In-browser (VECTOR.jsx):**
- **Structured Reflexive Analysis** — Completely rebuilt. Now returns exactly 3 candidates per analysis, each with: hypothesis (falsifiable), axis (A=ScoringMechanism, B=HarnessThresholds, C=InjectionStrategy, D=SignalDetection, E=NoiseModel, F=KalmanVariant), exploitation/exploration type, mechanism_change (not parameter tuning), enable_modules, predicted_delta. Anti-parameter-tuning rules enforced in prompt — parameter-only suggestions explicitly rejected.
- **Frontier Tracker** — `vector_frontier` localStorage key tracks best avg C-score per AutoTune context type (code/creative/analytical/conversational/chaotic). Updated automatically after Reflexive Analysis and on positive RLHF feedback.
- **Evolution History** — `vector_evolution` localStorage key persists all proposed and applied candidates as JSONL. Passed to Reflexive Analysis so it avoids repeating the same axis.
- **Evolution Logging on Drift** — Every drift event logs a structured evolution entry (preset, avg_c, delta, axis, outcome) for offline analysis.
- **Evolution Summary Export** — EXPORT tab now includes "JSONL — Evolution Summary" button. Outputs Meta-Harness compatible JSONL + frontier JSON.
- **Upgraded Candidate Display** — Reflexive Analysis results now show axis label, exploitation/exploration type, predicted delta, mechanism change description, and modules to enable. Color-coded by type and priority.

**Offline Tools (`tools/`):**
- **`vector_harness.py`** — Offline VECTOR scoring engine. Runs full TF-IDF+JSD+Kalman+GARCH scoring on a transcript JSON without a browser. Outputs per-turn C-scores, variance states, drift events, health score.
- **`meta_loop.py`** — Autonomous evolution loop. Scores baseline → proposes 3 candidates via Claude → scores each → updates frontier → repeats N iterations. Direct port of Meta-Harness run_evolve() pattern.
- **`frontier.py`** — CLI frontier tracker. Shows best known config per preset, evolution history, axis distribution, win rate.
- **`domain_spec.md`** — Onboarding template (adapted from Meta-Harness ONBOARDING.md). Fill out before running the evolution loop.
- **`requirements.txt`** — anthropic, python-dotenv.

### Framing Update
- VECTOR is now explicitly framed as a controller for **any sequential generative process**, not LLM-only. Applies equally to software pipelines, robotics, scientific simulations, financial modeling.
- README updated with Meta-Harness integration section and proper attribution.

---

## [1.4.2] — 2026-04-15

### Bug Fix
- **Lévy Flight toggle unresponsive** — `levyEnabled` and `setLevyEnabled` were in the `tuneCtxValue` deps array but missing from the value object itself. TuneModal could not read or set the state. Toggle now works.

---

## [1.4.1] — 2026-04-15

### Bug Fix
- **`levyEnabled is not defined` artifact crash** — `levyEnabled`, `useEKF`, `useParticle`, `berryPhase`, `sheTorque` were declared as state in the main component but never added to `TuneCtx` value object or destructured in `TuneModal`. Any render touching the FEATURES tab or sidebar metrics crashed. All five now properly in context.

---

## [1.4.0] — 2026-04-15

### New Math Modules
- **Extended Kalman Filter (EKF)** — Nonlinear Jacobian linearization at each step. More accurate than linear Kalman for the OU + periodic forcing dynamics. Toggle in FEATURES. Blends with standard Kalman when enabled.
- **Particle Filter (Sequential Monte Carlo)** — Non-parametric. 200 particles representing the full state distribution. Systematic resampling when ESS drops below N/2. Handles non-Gaussian and multimodal drift. Toggle in FEATURES. Blends PF mean with Kalman estimate.
- **Vasicek SDE Model** — Like CIR but allows negative values. Models sessions that go genuinely incoherent below zero. `dX = κ(θ−X)dt + σ dW`. Selectable in Advanced → Alt SDE Model (shares CIR params).
- **SABR Stochastic Volatility Model** — Two coupled SDEs: forward process + vol-of-vol. Stochastic Alpha Beta Rho. Richer volatility surfaces than GARCH + OU alone. Selectable in Advanced → Alt SDE Model.
- **Berry Phase (Geometric Phase Proxy)** — Measures whether coherence trajectory forms closed loops. High phase = stable oscillating session. Low phase = drifted and never returned. Displayed in sidebar.
- **Spin Hall Effect Coupling (Scalar Proxy)** — Simplified SOT switching model from spintronics. Variance acts as spin current, Kalman x̂ as magnetization state. θ_SH=0.20 (heavy metal analog). Positive torque = stabilizing. Displayed in sidebar.

### Sidebar Additions
All new signals displayed live: Berry Phase, SHE Torque (joined existing Lyapunov, PID, Mutual Info, Realized Vol, Fisher Info, LZ Complexity).

---

## [1.3.0] — 2026-04-15

### New Math Modules
- **PID Controller on variance** — Classical Proportional-Integral-Derivative control applied to smoothedVar as the process variable. P tracks current error, I accumulates drift history (anti-windup capped), D tracks acceleration. Output automatically escalates harness to MODERATE when PID > 2.0 at turn 3+. P/I/D/output displayed in sidebar.
- **Mutual Information between turns** — Measures statistical dependence between current response and prior context. Stronger than JSD — MI captures when responses become statistically independent of the conversation. Low MI (< 0.30) is a drift risk indicator. Displayed in sidebar.
- **Lyapunov Stability Bound** — Live computation of whether current SDE parameters guarantee convergence. For OU process: stable iff a_max = (α + β_p - δ·σ²)/(1+κ) < 0. Stability margin displayed as ✓ STABLE / ⚠ UNSTABLE with numeric margin in sidebar.
- **Realized Volatility** — Rolling squared returns complement to GARCH. Faster-reacting variance estimate (window=8). Catches volatility spikes GARCH may lag. Displayed in sidebar.
- **Kolmogorov Complexity Proxy** — LZ run-length encoding ratio as information density measure. High = complex/dense, Low = repetitive/compressible. Displayed as LZ Complexity in sidebar.
- **Fisher Information** — Rate of change in score distribution per turn. Spike = sudden shift in response character. Normalized by variance. Displayed in sidebar.
- **Lévy Flight Noise** — Heavier-tailed than Langevin. Models rare large behavioral jumps using Chambers-Mallows-Stuck method for α-stable distributions (default α=1.7). Toggle in FEATURES tab. When active, replaces Langevin in SDE noise term. κ stability index adjustable.

### Bug Fixes
- `kalmanHistory` missing from sendMessage deps — innovation whiteness check was using stale Kalman history.
- `featIntegrityFloor` and `integrityThreshold` missing from sendMessage deps — Integrity Floor changes mid-session had no effect.
- CIR simulation output not clamped — could produce negative values despite input guard.

---

## [1.2.0] — 2026-04-15

### Bug Fixes
- **`kalmanHistory` missing from sendMessage deps** — Innovation whiteness check (`computeInnovationAutocorrelation`) used `kalmanHistory` inside `sendMessage` but it was absent from the `useCallback` deps array. The check was always running against a stale snapshot. Now included.
- **`featIntegrityFloor` and `integrityThreshold` missing from sendMessage deps** — Both are used to fire `INTEGRITY_BREACH` events inside `sendMessage`. Toggling the Integrity Floor or changing the threshold mid-session had no effect on the running callback. Now included.
- **CIR simulation output not clamped** — `Math.max` guard was applied to the input `x` but not the output `path[i]`. A large negative noise draw could still produce negative values, breaking the core CIR guarantee. Output now clamped to `Math.max(..., 0)`.

---

## [1.1.0] — 2026-04-14

### New Features
- **Before/After Demo Mode** — DEMO button in header. Runs the last user message through a clean session (no harness injection) and displays both responses side by side with C-score differential.
- **CIR SDE Model** — Cox-Ingersoll-Ross simulation fully implemented and wired. `dX = κ(θ−X)dt + σ√X dW`. Keeps variance positive. Selectable in Advanced → Alt SDE Model.
- **Heston Stochastic Volatility Model** — Correlated stochastic volatility fully implemented and wired. `dS/S = √V dW₁ · dV = κ(θ−V)dt + σ√V dW₂ · ρ`. Selectable in Advanced → Alt SDE Model.
- **RLHF→SDE Bridge** — -1 rating on a drifted turn (harness active, rawScore < 0.65) nudges adaptive sigma upward 8%. Logged as `rlhf_sde_adapt`. κ never touched.
- **GARCH Entropy Regularization** — Response entropy > 0.9 dampens GARCH innovation term by 50%. Reduces false positive cascades on legitimately varied content.
- **Bayesian Prior on Early Scoring** — Turns 1–9 blend toward 0.75 baseline, full trust at turn 10. Eliminates noisy false drift at session start.
- **Disclaimer Skip Button** — "SKIP — USE STANDARD MODE" added to κ selection modal. Defaults to 0.500 without requiring disclaimer read.

### Bug Fixes
- CIR/Heston SDE models were UI-only — no simulation functions existed, `livePaths` always ran default OU. Both now fully implemented.
- DEFAULT (OU) button added to Alt SDE selector — no way to switch back previously.
- `liveSDEOverride` missing `mtjEnabled`/`mtjDelta` from deps — Langevin changes didn't rebuild override.
- Embedder worker timeout — stuck on "LOADING MODEL..." indefinitely on failure. Now times out at 5 seconds, routes permanently to TF-IDF fallback.
- Token estimate hidden until turn ≥ 2 — was showing 0 on turn 1.
- Memory growth caps — coherenceData/scoreHistory capped at 200, eventLog at 500 on save.

### Documentation
- SECURITY.md, CONTRIBUTING.md, FRAMEWORK.md added
- README rewritten with deployment instructions, "What this solves", feature comparison, SDK example, project structure

---

## [1.0.0] — 2026-04-14

Initial release of VECTOR — Volatility-Sensitive Correction Engine.

### Renamed & Redesigned from ARCHITECT V2.3
- Full rename: ARCHITECT → VECTOR across all files and storage keys
- Component renamed: `HudsonPerryDriftV1` → `VECTOR`
- Pipe format: `[A|...|/A]` → `[V|...|/V]`
- Storage keys migrated to `vector_` prefix
- Dead files removed: `public/bundle.js`, `public/index.html`

### Core Features
- TF-IDF + Jensen-Shannon Divergence coherence scoring (smoothed IDF)
- GARCH(1,1) variance modeling with per-preset tuning
- UKF (Vercel) + Linear Kalman (artifact) state estimation
- SDE simulation — OU + periodic forcing + jump-diffusion + GARCH-in-Mean
- Langevin/MTJ noise model (Neel-Brown relaxation)
- Pipe injection engine — compressed u_drift(t), 60–70% token reduction
- RAG retrieval, session rewind, context pruning
- H-Signals (5 proxies) + B-Signals (7 proxies)
- Post-audit dual Kalman with quiet fail detection
- AutoTune, Feedback Loop (EMA), Reflexive Analysis
- Knowledge Anchors, Persistent Doc Slots, Session Memory
- META Panel, Quick Tools (CALC/VERIFY/EXPORT)
- EWMA trend, hedge detection, truncation, anchor distance, innovation whiteness, efficiency ratio
- Session health score, Integrity Floor
- Multi-provider proxy: Anthropic, OpenAI, Grok (Vercel)
- Semantic embeddings: all-MiniLM-L6-v2 ONNX (Vercel)
- 7 presets, 4 themes, full TypeScript SDK
- Advanced tab: CIR/Heston SDE, custom rails, MHT Study, Poole CA Simulator

### Bug Fixes from ARCHITECT V2.3.1
- Stale deps in sendMessage useCallback
- userMessage crash on empty string
- HTTP 404 on direct API endpoint
- temperature + top_p never both sent to Anthropic API

### MTJ Delta
- `MTJ_DELTA_DEFAULT` 50 → 25 — meaningful heavier-tailed noise

---

*© 2026 Hudson & Perry Research*
