# CHANGELOG — VECTOR

All notable changes to VECTOR will be documented here.

---

## Historical Reference

VECTOR is a ground-up redesign and rename of the original ARCHITECT project.  
Full development history from ARCHITECT V1.0 through V2.3 is preserved at:

**[github.com/Myth727/ARCHITECT-Universal-Coherence-Engine](https://github.com/Myth727/ARCHITECT-Universal-Coherence-Engine)**

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
- Knowledge Anchors — domain vocabulary calibration (Medical, Legal, Engineering, Finance, Research)
- Persistent Document Slots — 3 pinned docs, injected every turn
- Strategic Session Memory — auto-compress at turns 10/20/30
- META Panel — second analysis chat with live session data
- Quick Tools Drawer — CALC, VERIFY (15 checks), EXPORT (CSV/JSONL/TXT)
- EWMA coherence trend — directional momentum over score history
- Hedge detection — Grice's maxim of quantity
- Truncation detection — abrupt response endings
- Anchor distance — slow-burn drift from session origin
- Kalman innovation whiteness check (Box & Jenkins 1970)
- Token efficiency ratio — information density vs length
- Session health score (0–100) with preset-weighted penalties
- Integrity Floor — DRIFT vs INTEGRITY BREACH detection
- Multi-provider proxy — Anthropic, OpenAI, Grok (Vercel only)
- Semantic embeddings — all-MiniLM-L6-v2 ONNX ~23MB (Vercel only)
- Cross-session persistence via localStorage polyfill
- 7 industry presets: DEFAULT, TECHNICAL, CREATIVE, RESEARCH, MEDICAL, CIRCUIT, CUSTOM
- 4 themes: Navy, Dark, Light, High Contrast
- Full TypeScript SDK (`sdk/*.ts`) — all math exportable for external pipelines
- Advanced tab (opt-in, consent required): CIR/Heston SDE models, custom rails, MHT Study, Poole CA Simulator

### Bug Fixes Carried from ARCHITECT V2.3.1
- Stale deps in sendMessage useCallback — kalmanHistory, scoreHistory, sessionMemory, lastAutoTune missing from deps array
- userMessage crash on empty string — guard added before coherence scoring
- HTTP 404 on direct API endpoint — `_isVercel` detection corrected
- temperature + top_p conflict — never both sent in same Anthropic API call

### MTJ Delta
- Changed `MTJ_DELTA_DEFAULT` from 50 to 25 — at Δ=50, η≈1.005 (essentially Gaussian). Meaningful heavier-tailed noise starts at Δ=20–25 where η≈1.012.

---

*© 2026 Hudson & Perry Research*
