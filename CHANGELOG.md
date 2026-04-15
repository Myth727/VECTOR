# CHANGELOG — VECTOR

All notable changes to VECTOR will be documented here.

---

## Historical Reference

VECTOR is a ground-up redesign and rename of the original ARCHITECT project.  
Full development history from ARCHITECT V1.0 through V2.3 is preserved at:

**[github.com/Myth727/ARCHITECT-Universal-Coherence-Engine](https://github.com/Myth727/ARCHITECT-Universal-Coherence-Engine)**

---

## [1.1.0] — 2026-04-14

### New Features
- **Before/After Demo Mode** — DEMO button in header. Runs the last user message through a clean session (no harness injection) and displays both responses side by side with C-score differential. The single most direct way to show what VECTOR does.
- **CIR SDE Model** — Cox-Ingersoll-Ross simulation now fully implemented and wired. dX = κ(θ−X)dt + σ√X dW. Keeps variance positive. Selectable in Advanced → Alt SDE Model.
- **Heston Stochastic Volatility Model** — Correlated stochastic volatility simulation now fully implemented and wired. dS/S = √V dW₁ · dV = κ(θ−V)dt + σ√V dW₂ · correlation ρ. Selectable in Advanced → Alt SDE Model.
- **RLHF→SDE Bridge** — When a -1 rating is given on a turn where harness was active and coherence was low (< 0.65), VECTOR treats this as confirmed correction failure and nudges the adaptive sigma upward by 8%. Logged as `rlhf_sde_adapt` event. κ=0.444 is never touched — only the sigma adaptation path.
- **GARCH Entropy Regularization** — High-entropy responses (legitimate creative/exploratory content, entropy > 0.9) now dampen the GARCH innovation term by 50%. Reduces false positive signal cascades on varied but coherent output.
- **Bayesian Prior on Early Scoring** — Turns 1–9 blend coherence scores toward a 0.75 baseline, reaching full trust at turn 10. Eliminates noisy false drift events at session start.
- **Disclaimer Skip Button** — "SKIP — USE STANDARD MODE" button added to the κ selection modal. Defaults to κ=0.500 without requiring the user to read the full disclaimer. Exit always existed conceptually — now it's visible.

### Bug Fixes
- CIR and Heston SDE models were UI-only — params saved, state persisted, but no simulation functions existed and `livePaths` always ran default OU regardless of selection. Both models now fully implemented and running.
- DEFAULT (OU) button added to Alt SDE selector — previously no way to switch back to default OU once CIR or Heston was selected.
- `liveSDEOverride` missing `mtjEnabled` and `mtjDelta` from deps array — Langevin toggle changes didn't rebuild the override. Fixed.
- Embedder worker stuck on "LOADING MODEL..." indefinitely if network was slow or worker failed. Now times out after 5 seconds and permanently routes to TF-IDF fallback.
- Token estimate showing 0 on turn 1 (looked broken). Now hidden until turn >= 2.
- Memory growth: coherenceData, eventLog, scoreHistory now trimmed on save (200/500/200 cap) to prevent silent localStorage overflow on long sessions.

### Documentation
- SECURITY.md added
- CONTRIBUTING.md added with validation experiment specifications
- FRAMEWORK.md added as standalone mathematical reference
- README updated with deployment instructions, "What this solves" section, feature comparison table, SDK example, project structure

---

## [1.0.0] — 2026-04-14

Initial release of VECTOR — Volatility-Sensitive Correction Engine.

### Renamed & Redesigned from ARCHITECT V2.3
- Full rename: ARCHITECT → VECTOR across all files and storage keys
- Component renamed: `HudsonPerryDriftV1` → `VECTOR`
- Pipe format updated: `[A|...|/A]` → `[V|...|/V]`
- Storage keys migrated to `vector_` prefix
- Dead files removed: `public/bundle.js`, `public/index.html`
- FRAMEWORK.md added as standalone reference document
- README fully rewritten with deployment instructions, feature comparison, SDK example

### Features Carried from ARCHITECT V2.3
- TF-IDF + Jensen-Shannon Divergence coherence scoring (smoothed IDF)
- GARCH(1,1) variance modeling with per-preset tuning
- Unscented Kalman Filter (UKF) — sigma-point propagation for nonlinear dynamics
- Linear Kalman filter (artifact mode fallback)
- SDE simulation — OU + periodic forcing + jump-diffusion (Merton 1976) + GARCH-in-Mean
- Langevin/MTJ noise model — Neel-Brown relaxation (Brown 1963; Koch et al. 2000)
- Pipe injection engine — compressed u_drift(t) format, 60–70% token reduction
- RAG retrieval — TF-IDF similarity, top-K cache
- Session rewind — 20-turn snapshot buffer
- Context pruning — top-K coherent pairs + last 3
- H-Signals (5 hallucination proxies) + B-Signals (7 behavioral proxies)
- Post-audit dual Kalman — second coherence pass with quiet fail detection
- AutoTune — context detection (code/creative/analytical/conversational/chaotic)
- Feedback Loop — EMA learning from +1/−1 ratings, persists across sessions
- Reflexive Analysis — session fingerprint → prioritized config suggestions
- Knowledge Anchors — domain vocabulary calibration
- Persistent Document Slots — 3 pinned docs, injected every turn
- Strategic Session Memory — auto-compress at turns 10/20/30
- META Panel — second analysis chat with live session data
- Quick Tools Drawer — CALC, VERIFY, EXPORT
- EWMA, hedge detection, truncation detection, anchor distance, innovation whiteness, efficiency ratio
- Session health score (0–100) with preset-weighted penalties
- Integrity Floor — DRIFT vs INTEGRITY BREACH detection
- Multi-provider proxy — Anthropic, OpenAI, Grok (Vercel only)
- Semantic embeddings — all-MiniLM-L6-v2 ONNX (Vercel only)
- 7 industry presets: DEFAULT, TECHNICAL, CREATIVE, RESEARCH, MEDICAL, CIRCUIT, CUSTOM
- 4 themes: Navy, Dark, Light, High Contrast
- Full TypeScript SDK (`sdk/*.ts`)
- Advanced tab: CIR/Heston SDE models, custom rails, MHT Study, Poole CA Simulator

### Bug Fixes from ARCHITECT V2.3.1
- Stale deps in sendMessage useCallback
- userMessage crash on empty string
- HTTP 404 on direct API endpoint
- temperature + top_p never both sent in same Anthropic API call

### MTJ Delta
- `MTJ_DELTA_DEFAULT` changed from 50 to 25 — meaningful heavier-tailed noise

---

*© 2026 Hudson & Perry Research*
