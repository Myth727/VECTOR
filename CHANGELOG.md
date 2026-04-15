# CHANGELOG — VECTOR

All notable changes to VECTOR will be documented here.

---

## Historical Reference

VECTOR is a ground-up redesign and rename of the original ARCHITECT project.  
Full development history from ARCHITECT V1.0 through V2.3 is preserved at:

**[github.com/Myth727/ARCHITECT-Universal-Coherence-Engine](https://github.com/Myth727/ARCHITECT-Universal-Coherence-Engine)**

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
