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
