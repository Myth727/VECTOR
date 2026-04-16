# VECTOR
## Volatility Engine: Correction, Tracking, Output, Response
### A Volatility-Sensitive Correction Engine for sequential generative processes

**Applicable to:** Language models · Software agents · Inference pipelines · Multimodal systems · Any sequential generative process

© 2026 Hudson & Perry Research  
**Authors:** David Hudson ([@RaccoonStampede](https://x.com/RaccoonStampede)) · David Perry ([@Prosperous727](https://x.com/Prosperous727))  
**License:** MIT · [Live Demo](https://vector2026.vercel.app/)

> ⚠ RESEARCH & DEVELOPMENT — NOT FOR CLINICAL OR LEGAL USE.  
> All outputs are mathematical proxy indicators. No warranty expressed or implied.

---

## What this actually is

Most generative systems produce outputs and hope for the best.

VECTOR treats sequential generation as what it actually is: a stochastic process that can destabilize. It measures volatility in real time, detects when the system is drifting toward degraded output, and injects corrective signals before the output degrades further.

That's not prompt engineering. That's a feedback control loop.

**The core loop:**
```
Score output → Estimate state (Kalman) → Track volatility (GARCH) →
Detect instability → Inject correction (u_drift) → Repeat
```

**What this means in practice:** When a generative system starts drifting — getting sycophantic, inflating claims, losing context, contradicting itself, producing degraded output — VECTOR catches it mathematically and corrects dynamically. Not after the fact. During.

---

## What this solves

Seven problems that affect every serious generative AI workflow:

1. **Drift & Incoherence in Long Contexts** — LLMs wander, loop, confabulate. VECTOR quantifies it live and injects corrective directives automatically.
2. **Unreliable Self-Reflection** — No reliance on the model to "check itself." External statistical harness enforces coherence.
3. **Context Bloat & Token Waste** — Pruning + RAG + mute/gate keep prompts lean and relevant throughout long sessions.
4. **Domain Mismatch** — Presets and tunables adapt tolerance to your context: tight for code/audit, looser for creative work.
5. **Observability Black Box** — Dashboard, signals, exports, and session rewind provide audit trails and reproducibility.
6. **Prompt Engineering Fatigue** — Pipes and harness automate the steering that normally requires manual system prompts every turn.
7. **False Confidence in Outputs** — Proxy signals flag hype, sycophancy, and low-source replies. Post-audit catches quiet failures.

---

## ▶ Option 1 — Paste into Claude (instant, no setup)

1. Download `VECTOR.jsx` from the root of this repo
2. Open [claude.ai](https://claude.ai) and start a new conversation
3. Paste: `Create an artifact from this file. Run it exactly as-is.` followed by the full file contents

Works immediately. No account, no server, no install.

---

## ▶ Option 2 — Deploy on Vercel (any browser, cross-session memory)

**Live demo:** [vector2026.vercel.app](https://vector2026.vercel.app/)

1. Fork this repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your fork
3. Vercel auto-detects Next.js → tap **Deploy**

No environment variables needed. Users provide their own API keys.

**Vercel adds:** Semantic embeddings (all-MiniLM-L6-v2 ONNX ~23MB) · Unscented Kalman Filter (UKF) · Multi-provider (Anthropic, OpenAI, Grok) · Cross-session persistence

---

## How it works

**Volatility measurement:**  
Every output is scored using TF-IDF + Jensen-Shannon Divergence — measuring how much vocabulary and semantics shifted from prior context. That score feeds a GARCH(1,1) model that tracks volatility clustering over time and a Kalman filter that smooths the trajectory into a reliable state estimate.

**Why this matters:** A single unusual output might be fine. The system asks: is volatility rising across multiple turns? Is the system in a high-variance regime? That's what GARCH catches that individual turn scoring misses.

**Detection:**  
When volatility crosses thresholds, VECTOR fires signal detectors:

- **H-Signals (hallucination proxies):** High-confidence language under elevated variance. Low source consistency vs attached documents. Self-contradiction with prior turns. Low response entropy. High vocabulary novelty under instability.
- **B-Signals (behavioral proxies):** Sycophancy, hype inflation, roleplay drift, question flooding, topic hijack, unsolicited elaboration, phrase repetition.

All signals are proxy indicators. Honest framing enforced throughout.

**Correction:**  
When instability is detected, VECTOR injects a corrective directive into the next system prompt — `u_drift(t)` in the SDE framework. AUDIT mode detects only. MODERATE adds light correction. DEEP CLEAN and EXTREME apply progressively stronger constraints.

**The compressed pipe format:**
```
[V|t7|v=0.142|st=CAU|kx=0.887|kp=0.0004|cl=2|dr=1|md=AUD|h=0|b=0]->CONSOLIDATE.[/V]
```
60–70% fewer tokens than verbose injection formats. Identical information content.

---

## The Math

| Component | Origin | Function in VECTOR |
|---|---|---|
| SDE (OU process) | Physics / stochastic control | Models output trajectory evolution over time |
| GARCH(1,1) | Quantitative finance | Tracks volatility clustering across turns |
| Kalman filter | Aerospace / signal processing | Smooths noisy per-turn scores into reliable state estimate |
| TF-IDF + JSD | Information theory / NLP | Measures lexical shift and semantic drift per turn |
| Pipe injection | Control theory | u_drift(t) — corrective force applied to next output |
| Langevin noise | Spintronics / MTJ physics | Hardware-realistic stochastic uncertainty bands |
| Lévy flight noise | α-stable distributions | Heavy-tail noise for rare large behavioral jumps |
| PID controller | Classical control theory | Proportional-Integral-Derivative on variance |
| EKF / Particle Filter | Aerospace / robotics | Nonlinear and non-Gaussian state estimation |
| Berry phase | Quantum geometry | Geometric phase of coherence trajectory |
| Spin Hall Effect | Spintronics | Torque coupling between variance and Kalman state |
| Mutual information | Information theory | Statistical dependence between turns |
| Realized volatility | Quantitative finance | Fast-reacting variance complement to GARCH |
| Lyapunov bound | Dynamical systems | Live stability guarantee of SDE parameters |
| StableDRL clipping | RL stability (Li et al. 2026) | Unconditional ratio clipping + self-normalization prevents correction feedback loops |

**Core equation:**
```
dε(t) = a(t)ε(t)dt + b·dW_t
a(t) = (α + β_p·sin(ωt)) / (1+κ)
κ = 0.444 (Hudson Constant) or 0.500 (Standard) — user-selected
```

---

## Langevin Noise Extension

```
dW_t = b · √dt · z · η
η = √(1 + 1/(2Δ))
```

Δ (MTJ_DELTA) is the thermal stability factor from magnetic tunnel junction physics — Neel-Brown relaxation model (Brown 1963; Koch et al. 2000). Default Δ=25. Toggle ON/OFF in FEATURES tab.

**Honest framing:** The Langevin math is physically grounded. The direct empirical link between MTJ parameters and generative output coherence is theoretical — same mathematical family, not yet co-validated against actual hardware.

---

## Intelligence Layer

| Feature | What it does |
|---|---|
| **AutoTune** | Detects session context per turn, selects optimal generation parameters automatically |
| **Feedback Loop** | +1/−1 per response. EMA learning personalizes AutoTune profiles. Persists across sessions. |
| **Reflexive Analysis** | Sends session volatility fingerprint for analysis → returns prioritized config suggestions |
| **Knowledge Anchors** | Domain vocabulary (Medical, Legal, Engineering, Finance, Research) calibrates signal detection |
| **Persistent Doc Slots** | 3 pinned documents — injected every turn, never pruned, never forgotten |
| **Session Memory** | Auto-compresses history at turns 10/20/30. Solves long-session context loss. |
| **META Panel** | Second analysis chat with full VECTOR architecture + live session data embedded |
| **Quick Tools Drawer** | CALC (SDE/GARCH calculator), VERIFY (15 live session checks), EXPORT (CSV/JSONL/TXT) |
| **Demo Mode** | Run any prompt with and without VECTOR correction side by side. C-score differential shows exactly what the harness changes. |
| **RLHF→SDE Bridge** | -1 ratings on drifted turns feed back into the SDE sigma parameter — the engine learns from confirmed correction failures. |
| **Advanced Math Sidebar** | Live readout of Lyapunov stability bound, PID output, Realized Volatility, Mutual Information, Fisher Information, LZ Complexity, Berry Phase, SHE Torque. |

---

## Feature Comparison

| Feature | Claude artifact | Vercel |
|---|:---:|:---:|
| TF-IDF + JSD scoring | ✓ | ✓ fallback |
| Semantic embeddings (all-MiniLM-L6-v2) | — | ✓ |
| Linear Kalman filter | ✓ | — |
| Unscented Kalman Filter (UKF) | — | ✓ |
| GARCH(1,1) + jump-diffusion | ✓ | ✓ |
| Monte Carlo SDE bands | ✓ | ✓ |
| Langevin/MTJ noise model | ✓ | ✓ |
| AutoTune | ✓ | ✓ |
| Feedback loop (EMA learning) | ✓ | ✓ |
| Reflexive session analysis | ✓ | ✓ |
| Knowledge Anchors | ✓ | ✓ |
| Persistent Document Slots | ✓ session | ✓ cross-session |
| Strategic Session Memory | ✓ session | ✓ cross-session |
| META Panel | ✓ | ✓ |
| Quick Tools (CALC/VERIFY/EXPORT) | ✓ | ✓ |
| Display preferences (themes, font, compact) | ✓ | ✓ |
| H-signals + B-signals | ✓ | ✓ |
| Session rewind, RAG, bookmarks | ✓ | ✓ |
| Integrity Floor | ✓ | ✓ |
| Multi-provider (OpenAI, Grok) | — | ✓ |
| API key persistence | — | ✓ |
| Works without Claude account | — | ✓ |

---

## Presets

| Preset | Dec / Cau / Calm | Best For |
|---|---|---|
| DEFAULT | 0.200 / 0.120 / 0.080 | General use |
| TECHNICAL | 0.180 / 0.100 / 0.060 | Code, audits, engineering |
| CREATIVE | 0.280 / 0.160 / 0.100 | Writing, brainstorming |
| RESEARCH | 0.220 / 0.130 / 0.085 | Academic, long-form analysis |
| MEDICAL | 0.150 / 0.090 / 0.055 | High-stakes, precision-critical |
| **CIRCUIT** | **0.140 / 0.080 / 0.050** | **Logic verification, tightest tolerance** |
| CUSTOM | user-defined | Fully configurable |

---

## Validation Status

**Confirmed:** SDE math · Kalman filter · GARCH(1,1) · TF-IDF+JSD scoring · pipe injection · behavioral signal detection · per-preset GARCH tuning · epsilon parameterization · post-audit dual Kalman · Langevin/Neel-Brown math · EDM parallel discovery (Science Advances April 2026 independently arrived at same 45° angular gate VECTOR uses for drift detection)

**Requires validation:** C-score vs human judgment · H-signal false positive rate · 623.81 Hz physical anchor · Langevin/MTJ empirical co-validation against actual spintronic hardware · cross-domain applicability claims

---

## Optional Physics & Control Modules

Toggleable in **TUNE → FEATURES**. All default OFF — enable only what you need.

| Module | Toggle | What it does |
|--------|--------|-------------|
| Lévy Flight Noise | FEATURES tab | Replaces Langevin with α-stable heavy-tail noise (α=1.7). Models rare large behavioral jumps. |
| Extended Kalman Filter | FEATURES tab | Nonlinear Jacobian linearization. More accurate than linear Kalman for OU dynamics. |
| Particle Filter | FEATURES tab | 200-particle Sequential Monte Carlo. Handles non-Gaussian, multimodal drift. Blends with Kalman. |

Selectable in **TUNE → ADVANCED → Alt SDE Model**:
CIR · Heston · Vasicek · SABR · DEFAULT (OU)

All sidebar math metrics (Lyapunov, PID, Realized Vol, Mutual Info, Fisher Info, LZ Complexity, Berry Phase, SHE Torque) always computed and displayed — no toggle needed, no performance cost.

---

## Advanced / Experimental (opt-in, consent required)

- Alt SDE Models (CIR, Heston, Vasicek, SABR) — fully implemented, selectable in Advanced tab
- Custom behavioral rails
- Stability convergence panel (RESONANCE_ANCHOR = 623.81 Hz)
- Edit constants (κ, ε, GARCH params)
- MHT Study (Metatron-Hudson Theory SDE)
- Poole Manifold CA Simulator (3D cellular automaton, full adder verification)
- Integrity Floor (DRIFT vs INTEGRITY BREACH detection)

---

## SDK

```typescript
import { computeCoherence, kalmanStep,
  updateSmoothedVariance, buildPipeInjection,
  PRESETS } from './sdk/index';

const cfg    = PRESETS.CIRCUIT;
const score  = computeCoherence(response, history);
const newVar = updateSmoothedVariance(scoreHistory, prev, cfg);
const kalman = kalmanStep(state, score, turn * (2*Math.PI/12), SDE_PARAMS);
const pipe   = buildPipeInjection(newVar, kalman.x, kalman.P,
  calmStreak, driftCount, 'audit', turn, 0, 0, null, cfg);
```

---

## Project Structure

```
VECTOR.jsx                 ← paste into Claude
components/VECTOR.jsx      ← same file, used by Next.js
pages/api/proxy.ts         ← multi-provider proxy (Anthropic · OpenAI · Grok)
pages/index.tsx            ← Next.js entry
public/embedder.worker.js  ← neural embedding Web Worker (Vercel only)
sdk/*.ts                   ← TypeScript math library
evals/VECTOR_EVALS.md      ← 15-check release checklist
ai/knowledge/
  DIALOGUE_BASELINES.md
  HALLUCINATION_REFERENCE.md
  VECTOR_CODING_RULES.md
  DOCUMENT_INTELLIGENCE.md
```

---

## Meta-Harness Integration

VECTOR's Reflexive Analysis and offline optimization tools are adapted from the **Meta-Harness** framework by the Stanford IRIS Lab.

> Lee, Nair, Zhang, Lee, Khattab & Finn (2026). *Meta-Harness: End-to-End Optimization of Model Harnesses.* arXiv:2603.28052. https://arxiv.org/abs/2603.28052

**What we borrowed:**
- 3-candidate structured proposal format (exploitation + exploration)
- Exploitation/exploration axis taxonomy (A–F)
- Anti-parameter-tuning rules (parameter sweeps almost always regress — change mechanisms)
- Frontier tracking (`vector_frontier` localStorage key — best config per context type)
- Evolution summary JSONL format (compatible with Meta-Harness tooling)
- Offline harness pattern for `tools/vector_harness.py` and `tools/meta_loop.py`

**What's different:**
- Meta-Harness is an offline optimizer that searches over static harness configurations.  
  VECTOR is a live real-time controller that runs turn-by-turn during active sessions.
- Meta-Harness uses Python + Claude Code. VECTOR runs entirely in the browser.
- VECTOR's mathematical engine (SDE/GARCH/Kalman/PID) has no equivalent in Meta-Harness.

The two are complementary: Meta-Harness can auto-optimize VECTOR's preset parameters offline, then feed the winning config back into live sessions.

---

## Citation



```
Perry, D. & Hudson, D. (2026). VECTOR: Volatility-Sensitive Correction Engine.
Hudson & Perry Research. @RaccoonStampede · @Prosperous727
github.com/Myth727/VECTOR
```

---

*© 2026 Hudson & Perry Research — Experimental R&D. All outputs are proxy indicators.*
