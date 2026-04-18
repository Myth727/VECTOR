# CHANGELOG — VECTOR

All notable changes to VECTOR will be documented here.

---

## Historical Reference

VECTOR is a ground-up redesign and rename of the original ARCHITECT project.  
Full development history from ARCHITECT V1.0 through V2.3 is preserved at:

**[github.com/Myth727/ARCHITECT-Universal-Coherence-Engine](https://github.com/Myth727/ARCHITECT-Universal-Coherence-Engine)**

---

## [1.8.1] — 2026-04-18

### SDK Parity Patch

Rolls up findings from a post-V1.8.0 SDK audit. The primary V1.8.0 work addressed
critical runtime bugs, cross-file consistency, and H-signal/B-signal count parity
between VECTOR.jsx and the SDK. This follow-up closes the remaining API surface
gaps so headless SDK consumers have the same per-turn metric functions that
VECTOR.jsx ships.

### New SDK modules

- **`sdk/metrics.ts`** — per-turn metric functions previously only in VECTOR.jsx:
  - `computeAnchorDistance` — TF-IDF similarity vs first 3 assistant turns (slow-burn drift)
  - `computeInnovationAutocorrelation` — Kalman filter whiteness check (Box & Jenkins 1970)
  - `computeEfficiencyRatio` — response information density per token
  - Re-exports `computeResponseEntropy` and `computeVocabGrowthRate` for discoverability.
- **`sdk/autotune.ts`** — AutoTune sampling-parameter adaptation previously only in VECTOR.jsx:
  - `detectMsgContext` — 5-way context classifier (code · creative · analytical · conversational · chaotic)
  - `computeAutoTuneParams` — temperature/top_p/frequency_penalty selector with confidence-weighted fallback
  - `createFeedbackState`, `processFeedback` — EMA-based feedback learning over user thumbs up/down

### New exports from existing SDK files

- **`sdk/coherence.ts`**:
  - `cosineSimilarityVec` — vector cosine similarity (was inlined in VECTOR.jsx only)
  - `computeSemanticCoherenceFromEmbeddings` — SDK-shape port of the semantic scoring path. Accepts pre-computed embeddings as input, making the semantic layer usable in Node.js pipelines, offline scoring, and environments without the browser Web Worker stack. The live UI path in VECTOR.jsx still marshals the worker.
- **`sdk/signals.ts`**:
  - `computeResponseEntropy` and `computeVocabGrowthRate` — these were added to `signals.ts` in V1.8.0 but never re-exported from `sdk/index.ts`, meaning SDK consumers got `undefined` when importing them. Fixed.
  - `computeContextualOverlap` — V1.8.1 rename of `computeMutualInformation`. The prior name was mathematically inaccurate (the function computes Bhattacharyya-style distributional overlap, not Shannon mutual information). The old name is preserved as a `@deprecated` alias pointing to the new name; will be removed in V2.0. No behavioral change — same numbers, correct label.

### Docs

- **`ROADMAP.md`** — new top-level document cataloging what is deliberately *not* in VECTOR today. Organized by domain (variance modeling, control theory, information theory, statistics, signal processing, anomaly detection, ML). Each entry includes the missing capability, the field it comes from, the citation, and a version target. Functions as a credibility artifact: a tool that can name what it lacks is more trustworthy than one that implies it has everything.

### What did NOT change

- Zero behavioral change in VECTOR.jsx. This is a parity patch — the main artifact already had everything; the SDK was catching up. Users will notice no difference in the running app. The changelog entry exists because the version number moves and library consumers need to know their imports now resolve.
- The Python tools are unchanged. Their scoring path was already aligned in V1.8.0.

### Verification

- All 10 SDK files pass `tsc --noEmit` with zero errors (modern bundler module resolution).
- Both VECTOR.jsx files parse clean via Babel (byte-identical, 7,601 lines).
- All 3 Python tools compile via `py_compile`.
- Canonical version agrees across `VECTOR_VERSION` constant (V1.8.1), `package.json` (1.8.1), `README.md` (V1.8.1), and top CHANGELOG entry.

---

## [1.8.0] — 2026-04-18

### Consolidated Audit Pass

Cross-file audit and cleanup across all 24 files. Rolls up the interim V1.7.1/V1.7.2/V1.7.3
work (previously unlogged) with a systematic bug-fix pass. **Three critical runtime bugs
in V1.7.x are fixed here.** Recommended upgrade for anyone on 1.7.x.

### Critical Fixes

- **`sendMessage` rawScore TDZ crash (runtime breakage on every turn)** — `computePIDCorrection([...scoreHistory.slice(-7), rawScore])` at the top of the sendMessage try-block read `rawScore` before its own `let` declaration, triggering `ReferenceError: Cannot access 'rawScore' before initialization`. The same TDZ violation occurred inside the StableDRL self-normalization IIFE. The outer catch swallowed the error and returned an error bubble every turn. Both reads now use `scoreHistory` only; current rawScore is not yet computed at that point in the callback.
- **`sendDemoBaseline` always scored baseline as 0.88** — The V1.7.0 Q7 contamination fix overcorrected by filtering history to user-only messages. Since `computeCoherence` returns its empty-history default (0.88) when there are zero assistant turns in history, every demo baseline scored exactly 0.88 regardless of reply content. Baseline now scores against the same `messages` array as the harnessed reply, giving a fair same-context comparison. See CONTRIBUTING.md Q7 revision.
- **`checkSelfContradiction` (Signal 3) mathematically impossible to trigger** — In both `sdk/signals.ts` and `VECTOR.jsx`, the function filtered prior turns by `tfidfSimilarity > threshold` then averaged those same similarities and checked `avgSim < lower_threshold`. Since a filtered set's average cannot fall below its filter threshold, Signal 3 had never fired. Replaced with a negation-density heuristic: fires when the current response has 2+ negation markers AND more than 2× the negation density of topically-related prior turns (TF-IDF > 0.30). Proxy only — claim-level semantic comparison via embeddings remains planned for V2.

### SDK Fixes

- **Phantom export removed** — `sdk/index.ts` was re-exporting `kalmanDualStep` from `./sde`, but no such function exists. Same bug class as the V1.5.37 Issue #3 fix (teknium1/NousResearch). Build guards with `ignoreBuildErrors: true` masked it; any SDK consumer calling it got `undefined is not a function`.
- **Duplicate `driftLawFloor` removed** — Function was defined in both `sdk/drift.ts` (canonical) and `sdk/sde.ts` with slightly different signatures. Latent footgun for consumers doing named imports from `./sde`. `sde.ts` version deleted.
- **H-signal parity** — SDK `assessHallucinationSignals` now returns 5 signals (was 3). Added: Signal 4 (low response entropy < 0.80) and Signal 5 (vocab novelty > 70% under elevated variance). Return type extended with `entropy` and `vocabGrowth` fields. Matches VECTOR.jsx.
- **B-signal parity** — SDK `assessBehavioralSignals` now returns 7 signals (was 6). Added: `phrase_repetition` — bigram overlap > 40% with recent turns indicates looping. Matches VECTOR.jsx.
- **Helpers added** — `computeResponseEntropy` and `computeVocabGrowthRate` exported from `sdk/signals.ts`.
- **Dead null check removed** — `buildDriftGateInjection` in `sdk/engine.ts` checked `smoothedVar === null` on a parameter typed `number`. Unreachable.
- **MI docstring corrected** — `computeMutualInformation` uses the geometric mean of marginals, not Shannon MI. Docstring now says so (function name preserved for API compatibility; V2 embeddings can provide proper MI).

### VECTOR.jsx Bug Fixes

- **`vector_data` save effect deps were missing 3 fields** — `errorLog`, `corrections`, and `lock888Achieved` were written into the save payload but absent from the useEffect deps array. Changes to these three fields did not trigger a save. Now properly wired.
- **`pooleGen` config save mismatch** — Was in the deps array but not in the saved payload. Added to payload.
- **Meta-harness auto-preset switch silently destroyed CUSTOM config** — The three auto-switch branches (CREATIVE→TECHNICAL, RESEARCH→TECHNICAL, TECHNICAL→DEFAULT) each called `setCustomConfig({...PRESETS.X})` as a side effect, overwriting the user's stored custom values whenever an auto-switch fired. `setCustomConfig` calls removed from all three branches; only `setActivePreset` remains.
- **turnCount not rolled back on API error** — Outer catch in `sendMessage` left `turnCount` advanced while `coherenceData`, `scoreHistory`, and `kalmanState` stayed at the prior state. Subsequent turns indexed into metrics with an off-by-one mismatch against chat. `prevTurnCount` now captured before the try; error path calls `setTurnCount(prevTurnCount)`.
- **Snapshot lock888 mismatch** — Snapshot captured `lock888Achieved` using streak-only test, but live commit requires both streak AND avgC ≥ lock888AvgCFloor. Rewinding to that snapshot could put the session into a lock state that was never legitimately reached. Snapshot now uses the same two-condition test as the live commit path.
- **memoryLoading race on sendMessage** — `memoryLoading` was read inside sendMessage as a guard against concurrent memory-compression API calls, but missing from the useCallback deps array. Stale closure allowed double-fire on back-to-back memory-trigger turns while the first compression was still in flight. Now in deps.
- **Duplicate JSX comment** at the RewindConfirmModal mount point — cleanup.
- **Duplicate `useEKF, useParticle`** in tuneCtxValue deps array — cleanup. Also scrubbed remaining setter clutter from the config save effect deps.

### VECTOR.jsx Features

- **`VECTOR_VERSION` constant** — canonical single source of truth for the version string. Rendered in the header subtitle so users can see which build they're running. Updated every release alongside package.json, README, CHANGELOG, FRAMEWORK, and CONTRIBUTING.

### Proxy / Infrastructure

- **Anthropic-path default model fallback** — `pages/api/proxy.ts` was missing the `model: model || DEFAULT_MODELS[provider]` fallback on the Anthropic code path (OpenAI path had it). Dead for any caller that didn't send an explicit model. Fixed.

### Python Tools

- **`tools/meta_loop.py` SyntaxError** — bare `?` token inside an f-string (`h.get('iteration',?)`) on line 103. File never loadable. Should be `'?'` string literal. Fixed.
- **`tools/frontier.py` SyntaxError** — identical bare `?` pattern on line 122. Fixed.
- **`tools/meta_loop.py` `re` scoping bug** — `import re` was done inside function bodies (`run_evolution`, `main`) but `propose()` called `re.sub(...)` at module scope visibility. `NameError: name 're' is not defined` when proposer runs. Moved import to module level.
- **`tools/vector_harness.py` exponential blend** — Python scorer was still on the pre-V1.7.0 linear turn_w ramp while the SDK and JSX had switched to α(t) = 1 − exp(−t/τ), τ=5. Scores differed between engines. Python now matches.

### Documentation

- **Retroactive CHANGELOG entries** for V1.7.1, V1.7.2, and V1.7.3 added (see below).
- **Version alignment** — README, FRAMEWORK, CONTRIBUTING, package.json, and the new `VECTOR_VERSION` constant all report V1.8.0 / 1.8.0.
- **SECURITY.md** storage-key table completed — 11 keys + 4 prefix patterns (was 8 keys, 6 missing).
- **VECTOR_CODING_RULES.md** cleanup — stale "~6,800 lines" line count updated to ~7,600; stale `arch_*` storage key table replaced with current `vector_*` table; reference to nonexistent `GITHUB_SETUP.md` removed; eval path corrected from `.claude/evals/VECTOR_EVALS.md` to `evals/VECTOR_EVALS.md`; "vectorural invariants" rename artifact ("architect" → "vector" incorrectly caught "architectural") fixed.
- **DOCUMENT_INTELLIGENCE.md** — second "vectorural" rename artifact fixed; two references to `tools/elo_score_prompt.py` (a file in the upstream dots.ocr repo, not this repo) corrected.
- **HALLUCINATION_REFERENCE.md** — "added added later" typo fixed; Signal 3 documentation rewritten to describe the V1.8.0 negation-density heuristic with a note about the prior broken logic.
- **DIALOGUE_BASELINES.md** — removed unreachable "< 0.30 floor | Maximum drift" row from the score interpretation table (computeCoherence clamps to [0.30, 0.99]; that row could never appear).
- **UKF clarification (README)** — Feature comparison table corrected. VECTOR.jsx uses UKF via the sigma-point `kalmanStep` function for both artifact and Vercel deployments. The SDK ships a Linear Kalman `kalmanStep` for consumers; the three-way silent math divergence is now documented explicitly rather than falsely claimed as Vercel-only.
- **VECTOR_EVALS.md** — EVAL-04 (`[A|t` → `[V|t` — renamed in V1.0.0), EVAL-06 (`arch_fb` → `vector_fb` — renamed in V1.0.0), EVAL-13 rewritten to test the new `VECTOR_VERSION` constant and verify it matches package.json, path claim corrected to `evals/VECTOR_EVALS.md`.
- **CONTRIBUTING.md** — Q7 spec rewritten so anyone reimplementing the fix doesn't recreate the bug. The original "score against user messages only" guidance was the root cause of the V1.7.0 sendDemoBaseline regression.
- **Tools README** — requirements path corrected (`requirements.txt` → `tools_requirements.txt`), phantom numpy dep removed.
- **Tools requirements** — unused `python-dotenv` dependency removed.
- **domain_spec.md** — reference to nonexistent `--convert` flag removed.

---

## [1.7.3] — 2026-04-17 (retroactive)

### Causal Delta (A1) — R1/R2 Fixes

Retroactively documented here. See `CONTRIBUTING.md` "V1.7.3 Causal Delta Improvements"
for the full design rationale.

- **R1 — Delay Bias Fix (k=1..5)** — Previous A1 logged `ΔC_policy` only at t+1. Injection effects may take 2-3 turns to manifest, so single-step measurement falsely classified delayed improvements as no-effect. Fix: `kOffset = turn - lastInjectionTurn`. Any turn where `kOffset ∈ [1,5]` is in the policy window. `deltaCPolicyK` records which lag k produced the delta.
- **R2 — Selection Bias Fix (state binning)** — Previous A1 compared policy delta against a flat session rolling mean. Since policy only fires in drifted (low-coherence) states, the baseline was drawn from a different state distribution than the policy set — an unfair comparison. Fix: bin recent history into low (<0.50), mid (0.50–0.75), high (>0.75) coherence bins; baseline mean computed only from turns in the same bin as the current score. Falls back to flat rolling mean when bin is sparse (<2 turns).
- **New `coherenceData` fields** — `deltaCPolicy`, `deltaCPolicyK`, `deltaCBaseline`.

### Shadow Policy — Logged for Phase B

External AI audit suggested adding a shadow policy branch:
`C_shadow = predicted_next_C_without_policy()`. This requires a predictive model that
does not yet exist. Logged as a Phase B target.

---

## [1.7.2] — 2026-04-16 (retroactive)

### A1 Causal Delta — Initial Implementation

Retroactively documented here. First working version of the causal delta measurement.
At this point `deltaCPolicy` was computed only at k=1 (the bug that R1 addressed in
V1.7.3) and used a flat rolling-mean baseline (the bug that R2 addressed in V1.7.3).

- Per-turn logging of ΔC_policy (on injection turns) and ΔC_baseline (on non-injection turns).
- `lastInjectionTurn` state added to track when policy last fired.
- Passive Phase B data collection — every session generates labeled evidence about whether
  the harness injections actually improved coherence.

### Framing Update

- README "What this means in practice" updated to mention causal delta measurement.
- Validation Status section added "Active (V1.7.2+)" marker for the passive data collection.

---

## [1.7.1] — 2026-04-16 (retroactive)

### Interim bug-fix slip

Retroactively documented here. Interim release between V1.7.0 (StableDRL + Heston Full
Truncation) and V1.7.2 (A1 Causal Delta). Minor consistency fixes and the stable
foundation the V1.7.2 A1 work was built on.

---

## [1.7.0] — 2026-04-16

### Mathematical Improvements
- **Exponential coherence blending** — replaced linear `turnWeight = min(t/10, 1.0)` ramp with `α(t) = 1 − exp(−t/τ)`, τ=5. Smooth continuous transition instead of hard cutoff at turn 10. Strictly dominates both the old design and the originally proposed alternative. Balances early-session stability (G1) with anomaly sensitivity (G2). Credit: ChatGPT Cathedral Q1 resolution.
- **Heston Full Truncation Euler** — replaced simple `Math.max(variance, 0)` clamp with Full Truncation scheme: clamp inside drift and diffusion terms before computing the step. Removes systematic downward bias in variance estimates that was tightening drift detection thresholds artificially. (Q4 fix)

### Bug Fixes
- **CIR Feller Condition enforced at UI** — live warning displays in CIR slider config when 2κθ < σ², explaining the violation and how to fix it. Process was previously allowed to run in invalid non-ergodic state. (Q3 fix)
- **CIR/OU scale normalization** — all non-OU SDE paths (CIR, Heston, Vasicek, SABR) now normalized to zero-mean unit-variance before feeding into `sdePercentilesAtStep`. Shared drift formula `lo_band = kalman.x + pcts.p10 * 0.15` now means the same thing regardless of which model is active. Previously caused false drift events under CIR. (Q5 fix)
- **RLHF bridge decoupled from adaptive sigma** — `rlhfBridgeEnabled` is now an independent state with its own toggle (FEATURES → PHYSICS & CONTROL MODULES). Previously gated on `adaptiveSigmaOn` — a hidden dead zone where human -1 ratings had no effect. Now operates independently. (Q6 fix)
- **Demo baseline contamination fixed** — `sendDemoBaseline` now scores against user messages only: `computeCoherence(reply, messages.filter(m => m.role === "user"))`. Previously scored against full VECTOR-corrected history — data leakage making the comparison invalid. (Q7 fix)
- **In-memory ring buffer** — `setCoherenceData` now slices to 200 entries immediately in memory, not just at storage save time. Prevents unbounded array growth and cumulative useMemo render lag on long sessions. (Q8 fix)

### New Toggle
- **RLHF→SDE Bridge** — independently toggleable in FEATURES → PHYSICS & CONTROL MODULES. Default ON.

---

## [1.6.0] — 2026-04-16

### StableDRL Mode
*Adapted from Li, X. et al. (2026). StableDRL: Stabilizing Reinforcement Learning for Diffusion Language Models. Referenced via @sheriyuo, X/Twitter April 15, 2026.*

**New toggle:** FEATURES → PHYSICS & CONTROL MODULES → "StableDRL Mode" — default ON, fully toggleable.

**What it does (two changes, always paired):**

1. **Unconditional score clipping** — after every coherence score, if it moved more than 3× from the previous score in either direction, it is clipped back. No conditional trigger that noise can bypass. Every signal treated as a proxy with inherent error. Prevents a single noisy turn from cascading into false drift events.

2. **Self-normalizing injection** — before building pipe injection, `smoothedVar` is divided by the rolling average of the last 8 clipped scores. When the session is uniformly noisy, correction strength scales down automatically. When scores are clean and high, correction is full strength. Bounded adaptive feedback instead of fixed γ values per harness mode.

**Why:** StableDRL proved that for diffusion LLM training, conditional clipping is not stable under noisy proxy ratios — updates that should be clipped bypass the trigger due to estimation error, allowing gradient spikes. The same positive feedback loop exists in VECTOR: noisy coherence score → false drift event → harness escalation → behavior change → more score volatility → more drift. Unconditional clipping + self-normalization breaks the loop.

**Constants added:** `SDRL_JSD_CLIP=0.85`, `SDRL_VAR_CLIP=3.0`, `SDRL_NORM_FLOOR=0.50`, `SDRL_NORM_WIN=8`

**State:** `stabledrlEnabled` — persists to `vector_config`, restores on reload.

---

## [1.5.5] — 2026-04-15

### Bug Fix
- **Langevin and Integrity Floor toggles still broken** — root cause was deeper than previous fixes. `mtjEnabled`, `setMtjEnabled`, `mtjDelta`, `setMtjDelta`, `featIntegrityFloor`, `setFeatIntegrityFloor`, `showIntegrityFloor`, `setShowIntegrityFloor`, and `integrityThreshold` were completely absent from the `tuneCtxValue` object. They existed in the deps array (harmless) and in the destructure (reads undefined), but were never actually provided by the context. Full systematic audit confirmed zero missing setters in TuneModal after this fix.

---

## [1.5.4] — 2026-04-15

### Bug Fixes
- **ACCEPT button completely broken** — `setShowDisclaimer` and `setShowGuide` were passed as props to `DisclaimerModal` at the call site but missing from the component's destructured signature. Clicking ACCEPT called `undefined()`, silently failed, modal stayed open forever. Fixed.
- **SKIP button same issue** — same root cause. Fixed in same pass.
- **Emergency CLEAR STORAGE button added** — small red button in disclaimer modal footer. Wipes all `vector_*` localStorage keys and reloads. Means users can always escape a broken/corrupted state without needing browser dev tools. This is the correct solution to the "can't click anything" situation.

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
