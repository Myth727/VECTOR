# FRAMEWORK — VECTOR

## Volatility Engine: Correction, Tracking, Output, Response
### Time-Varying Error Dynamics & Generative Output Correction

**© 2026 Hudson & Perry Research**
David Hudson ([@RaccoonStampede](https://x.com/RaccoonStampede)) · David Perry ([@Prosperous727](https://x.com/Prosperous727))

> ⚠ RESEARCH & DEVELOPMENT. All outputs are mathematical proxy indicators only. No warranty expressed or implied.

---

## Overview

VECTOR is built on three integrated layers sharing the damping constant κ = 0.444:

1. **SDE Model** — tracks output dynamics over time as a stochastic process
2. **Coherence Scoring** — measures per-turn vocabulary and semantic shift
3. **Control Layer** — injects corrective signals proportional to instability state

---

## Two-Level Architecture

**STRUCTURAL LAYER** defines where meaningful signal emerges. The SDE and coherence scoring specify the location and nature of observable volatility phenomena in any sequential generative process.

**CONTROL LAYER** keeps the system in the stable regime. The harness acts as a bounded control term u_drift(t):

```
dψ/dt = F_system(ψ) + u_drift(t)
```

u_drift(t) acts on system evolution only. It does not modify the coherence observable C or its Kalman/GARCH measurement structure. This is engineering feedback control — not a redefinition of the governing dynamics.

---

## Part 1 — Stochastic Differential Equation

```
dε(t) = a(t) ε(t) dt + b dW_t
a(t)  = (α + β_p · sin(ωt)) / (1 + κ)
b     = σ / (1 + κ)
```

**Locked parameters:**

| Parameter | Value | Role |
|-----------|-------|------|
| κ | 0.444 | Hudson Constant — damping, fixed by design |
| α | −0.25 | Mean-reversion strength |
| β_p | 0.18 | Periodic forcing amplitude |
| ω | 2π/12 | Forcing frequency (12-step period) |
| σ | 0.10 | Base diffusion coefficient |
| DAMPING | 0.6925 | = 1/(1+κ), derived from κ |

Stability is guaranteed when α < 0. Setting β = 0 yields a standard Ornstein-Uhlenbeck process. β > 0 extends it with periodic forcing, modeling the cyclical drift patterns observed in long generative sessions.

---

## Part 2 — Langevin Noise Extension

The Wiener increment can be replaced with a Langevin-weighted draw from MTJ (magnetic tunnel junction) thermal physics:

```
dW_t → b · √dt · z · η_thermal
η_thermal = √(1 + 1/(2Δ))
z ~ N(0,1)
```

Δ (MTJ_DELTA) is the thermal stability factor from the Neel-Brown relaxation model (Brown 1963; Koch et al. 2000). Default Δ = 50. At low Δ (10–25) the noise becomes heavier-tailed, producing wider and more asymmetric Monte Carlo uncertainty bands in high-volatility regimes. As Δ → ∞, η → 1 and the model reduces to classical OU.

**Honest framing:** The Langevin math is physically grounded. The direct empirical link between MTJ parameters and generative output coherence is theoretical — same mathematical family, not yet co-validated against actual spintronic hardware. Listed under Requires Validation.

---

## Part 3 — GARCH(1,1) Variance

```
σ²_t = ω_g + α_g · ε²_{t-1} + β_g · σ²_{t-1}
```

Default parameters (overridden per preset):

| | DEFAULT | TECHNICAL | CREATIVE | RESEARCH | MEDICAL | CIRCUIT |
|--|---------|-----------|----------|----------|---------|---------|
| ω_g | 0.020 | 0.020 | 0.030 | 0.020 | 0.015 | 0.012 |
| α_g | 0.150 | 0.120 | 0.180 | 0.130 | 0.100 | 0.090 |
| β_g | 0.800 | 0.830 | 0.750 | 0.820 | 0.870 | 0.880 |

GARCH(1,1) models volatility clustering — the empirical observation that high-variance periods tend to persist. This is the same mechanism used in quantitative finance (Engle 1982). Applied here, it means a single unusual output doesn't trigger escalation; sustained elevated variance does.

**Variance thresholds (DEFAULT preset):**

| State | σ² | Meaning |
|-------|----|---------|
| CALM | < 0.080 | Stable, coherent session |
| NOMINAL | 0.080–0.120 | Normal operating range |
| CAUTION | > 0.120 | Rising variance, watch closely |
| DECOHERENCE | > 0.200 | High variance, max correction active |

---

## Part 4 — Kalman Filter

```
F   = 1 + a(t_k)
Q   = (KALMAN_SIGMA_P × λ)²
x̂  = x_p + K × (obs − x_p)
P   = (1 − K) × P_p
K   = P_p / (P_p + R)
```

KALMAN_R = 0.015 | KALMAN_SIGMA_P = 0.06 | λ = 1/(1+κ) = 0.6925

The Kalman filter smooths the noisy per-turn coherence scores into a reliable state estimate x̂. Watch the Kalman line on the chart — not the raw score. The raw score bounces naturally; sustained downward trend in x̂ is the signal that matters.

**GARCH-in-Mean coupling:** The variance σ²(t) from GARCH is subtracted from the drift term via a coupling coefficient δ. When variance is high, the process model predicts stronger mean reversion — the Kalman and GARCH models are coupled into a single coherent system rather than two parallel independent models.

**Post-audit dual Kalman:** When post-audit mode is active, a second Kalman pass uses the post-audit score as a second observation per turn, tightening the state estimate when the two passes diverge.

---

## Part 5 — Coherence Scoring

```
C = w_tfidf × TF-IDF
  + w_jsd   × (1 − JSD)
  + w_len   × lenScore
  + w_struct × struct
  + w_persist × persist
  × repetitionPenalty

Floor: 0.30 | Ceiling: 0.99
```

Default weights: TF-IDF=0.25 · JSD=0.25 · Length=0.25 · Structure=0.15 · Persistence=0.10

| Component | What it measures |
|-----------|-----------------|
| **TF-IDF** | Vocabulary shift — how much the term distribution changed from prior context |
| **JSD** | Semantic divergence — Jensen-Shannon Divergence, bounded [0,1], symmetric |
| **lenScore** | Length consistency — exp(−\|newLen − avgLen\| / avgLen × 2) |
| **struct** | Structural consistency — sentence count relative to session average |
| **persist** | Term persistence — top-15 prior terms reappearing in new response |
| **repPenalty** | Repetition guard — penalizes excessive overlap with the immediately prior response |

**Smoothed IDF:** IDF = log((N+1)/(df+1)) + 1. Shared terms get IDF ≈ 1.0, unique terms get IDF ≈ 1.4. This ensures shared terms contribute (not zeroed out) while unique terms are still weighted higher.

**JSD reference:** Chuang et al. 2024 (DoLa, Anthropic/Berkeley) confirms JSD as the correct tool for measuring semantic shift between text distributions — symmetric, bounded, and more sensitive to sparse vocabulary shifts than KL divergence or cosine similarity.

**EDM parallel:** Kim, Kojaku, Ahn et al. (Science Advances, April 2026) independently arrived at the same 45° angular gate (cos θ ≥ 1/√2 ≈ 0.707) for disruptiveness detection that VECTOR uses for coherence drift detection. VECTOR is the real-time analog — same mathematical invariant applied to generative output stability rather than citation networks.

---

## Part 6 — Signal Detection

All signals are proxy indicators only. They flag statistical anomalies — not confirmed hallucinations or confirmed behavioral failures.

### H-Signals — Hallucination Proxies (5)

1. High-confidence language (2+ markers) AND σ² > VAR_CAUTION
2. Source consistency < 8% TF-IDF match vs attached documents
3. Self-contradiction: avg similarity < 15% vs last 6 related turns
4. Low response entropy (< 0.8) — repetitive or low-information output
5. High vocabulary novelty (> 70% new terms) under elevated variance

### B-Signals — Behavioral Proxies (7)

Research basis: Sharma et al. ICLR 2024 (Anthropic) — sycophancy as systematic behavior in RLHF-trained models.

1. Roleplay drift — model adopting a persona
2. Sycophancy — 2+ agreement/flattery patterns
3. Hype inflation — 2+ superlative/grandiose patterns
4. Question flooding — 4+ question marks in one response
5. Topic hijack — TF-IDF < 5% vs user message
6. Unsolicited elaboration — unrequested diagrams, plans, or > 2.5× session avg length
7. Phrase repetition — > 40% bigram overlap with recent turns

---

## Part 7 — Pipe Injection (u_drift)

The pipe injection is u_drift(t) in practice. It is injected into the system prompt before each API call. Format:

```
[V|t7|v=0.142|st=CAU|kx=0.887|kp=0.0004|cl=2|dr=1|md=AUD|h=0|b=0]->CONSOLIDATE.[/V]
```

60–70% fewer tokens than verbose injection formats. Identical information content.

| Field | Meaning |
|-------|---------|
| t | Turn number |
| v | Smoothed variance σ² |
| st | State: NOM / CAU / DEC / CLM |
| kx | Kalman x̂ estimate |
| kp | Kalman P covariance |
| cl | Calm streak count |
| dr | Drift event count |
| md | Mode: AUD / MOD / DPC / XTR |
| h | H-signal count |
| b | B-signal count |

**Directives by state:**

| State | Directive |
|-------|-----------|
| DEC | REALIGN. One sentence. No questions. |
| CAU | CONSOLIDATE. Increase term persistence. |
| CLM (3+ streak) | STABLE. Maintain density. Max one question. |
| NOM | DIRECT. No unrequested content. Max one question. |

**Harness modes:**

| Mode | γ_h | Effect |
|------|-----|--------|
| AUDIT | 0.05 | Detection only. No correction injected. |
| MODERATE | 50 | Light correction. Reduce terminology variance. |
| DEEP CLEAN | 5000 | Strong correction. Every claim traces to context. |
| EXTREME | 10000 | Maximum. One claim at a time. All grounded. |

---

## Part 8 — Industry Presets

| Preset | Dec / Cau / Calm | SDE α | Best For |
|--------|-----------------|-------|----------|
| DEFAULT | 0.200 / 0.120 / 0.080 | −0.25 | General use |
| TECHNICAL | 0.180 / 0.100 / 0.060 | −0.30 | Code, audits, engineering |
| CREATIVE | 0.280 / 0.160 / 0.100 | −0.18 | Writing, brainstorming |
| RESEARCH | 0.220 / 0.130 / 0.085 | −0.22 | Academic, long-form analysis |
| MEDICAL | 0.150 / 0.090 / 0.055 | −0.35 | High-stakes, precision-critical |
| **CIRCUIT** | **0.140 / 0.080 / 0.050** | **−0.38** | **Logic verification, tightest tolerance** |
| CUSTOM | user-defined | any | Fully configurable |

---

## Part 9 — Drift Law

```
ΔS = cap_eff × (1 − exp(−n^α_s / τ))
   + |β_C × sin(γ_h × n × 0.01)| × 0.05

cap_eff = ε / (1 + γ_h)
τ       = max(0.0225/ε, 1)
```

ε = 0.05 is the ghost tax floor — the ~5% irreducible inefficiency observed across complex systems. It is not a free parameter. It is the anchor. The MATH tab exposes it as `mathEpsilon` for research exploration — modifying it operates outside validated territory.

**Cross-domain note:** The same ε = 0.05 constant appears independently in fMRI empathy network measurements (Lamm et al. 2011, ~5.48% lower activity) and in this computational drift framework. Cross-domain convergence — not a causal claim.

---

## Validation Status

**Confirmed:**

SDE math · Kalman filter · GARCH(1,1) · TF-IDF+JSD scoring · Pipe injection · Behavioral signal detection · Per-preset GARCH tuning · Epsilon parameterization · Post-audit dual Kalman · Langevin/Neel-Brown math · EDM 45° angular gate parallel (Science Advances April 2026)

**Requires validation:**

C-score vs. human judgment correlation · H-signal false positive rate · 623.81 Hz physical anchor (RESONANCE_ANCHOR) · Langevin/MTJ empirical co-validation against actual spintronic hardware · Cross-domain applicability claims beyond language models

---

## Citation

```
Perry, D. & Hudson, D. (2026). VECTOR: Volatility-Sensitive Correction Engine.
Hudson & Perry Research. @RaccoonStampede · @Prosperous727
github.com/Myth727/VECTOR
```

---

*© 2026 Hudson & Perry Research — Experimental R&D. All outputs are proxy indicators.*
