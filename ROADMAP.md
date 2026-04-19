# VECTOR Roadmap — What's Deliberately Not Here Yet

© 2026 Hudson & Perry Research · MIT License

This document is a credibility artifact.

Every field VECTOR borrows from has a richer toolkit than what VECTOR currently implements. Pretending otherwise would make the rest of the project look less trustworthy. This file lists what we know is missing, where it comes from, what it would add, and what version it plausibly lands in. None of this is committed. All of it is on the table.

If you're building on top of VECTOR for a specific domain, this is the list of tools we'd probably reach for next if we had the resources — and which you may want to pull in yourself.

---

## How to read this document

Each entry follows the same shape:

- **Name** — the canonical name in its field
- **Field** — where it comes from
- **What it does** — in plain terms
- **Why VECTOR would benefit** — the specific gap it fills
- **Primary reference** — the citation most practitioners would expect
- **Target** — rough version estimate (V1.9 = near-term, V2.x = major additions, V3 = far future)

---

## 1. Variance Modeling — Finance / Econometrics

VECTOR currently implements **GARCH(1,1)** only. The volatility-clustering literature is far richer. The most noticeable gap is symmetry — GARCH(1,1) treats good and bad shocks identically, but real drift is asymmetric. A sudden confidence collapse in an AI response produces much bigger downstream variance than an equal-magnitude "unusually careful" response.

### EGARCH — Exponential GARCH
**Field:** Financial econometrics
**What it does:** Models volatility asymmetry using log-variance, with no non-negativity parameter constraints.
**Why VECTOR would benefit:** Captures the leverage effect — negative shocks (coherence collapse) increase future variance more than positive shocks (coherence recovery) of the same magnitude. This is exactly what happens in AI drift.
**Reference:** Nelson, D. B. (1991). *Conditional Heteroskedasticity in Asset Returns: A New Approach.* Econometrica 59(2).
**Target:** V1.9

### GJR-GARCH — Glosten-Jagannathan-Runkle GARCH
**Field:** Financial econometrics
**What it does:** Asymmetric threshold response via indicator function on sign of shock.
**Why VECTOR would benefit:** More intuitive parameter interpretation than EGARCH, directly testable "does negative news matter more?" coefficient.
**Reference:** Glosten, Jagannathan, Runkle (1993). *On the Relation Between the Expected Value and the Volatility of the Nominal Excess Return on Stocks.* Journal of Finance 48(5).
**Target:** V1.9 (pair with EGARCH)

### TGARCH — Threshold GARCH
**Field:** Financial econometrics
**What it does:** Models conditional standard deviation (not variance) with threshold term on sign of past returns.
**Reference:** Zakoian, J.-M. (1994). *Threshold Heteroskedastic Models.* Journal of Economic Dynamics and Control 18(5).
**Target:** V2.0

### APARCH — Asymmetric Power ARCH
**Field:** Financial econometrics
**What it does:** Generalizes multiple asymmetric forms into one family. Several comparison studies report APARCH outperforms EGARCH and GJR-GARCH on forecasting accuracy.
**Reference:** Ding, Granger, Engle (1993). *A Long Memory Property of Stock Market Returns and a New Model.* Journal of Empirical Finance 1(1).
**Target:** V2.0

### FIGARCH — Fractionally Integrated GARCH
**Field:** Financial econometrics
**What it does:** Captures long-memory persistence in volatility — past shocks influence future variance for extended periods.
**Why VECTOR would benefit:** Long AI conversations often show long-memory patterns — drift on turn 5 can still affect turn 30. Current GARCH(1,1) decays too quickly.
**Reference:** Baillie, Bollerslev, Mikkelsen (1996). *Fractionally Integrated Generalized Autoregressive Conditional Heteroskedasticity.* Journal of Econometrics 74(1).
**Target:** V2.1

### CGARCH — Component GARCH
**Field:** Financial econometrics
**What it does:** Decomposes volatility into short-term and long-term components that track separately.
**Why VECTOR would benefit:** Would cleanly separate "transient drift spike" from "persistent session degradation" — currently these are conflated into one σ² trace.
**Reference:** Engle, R. F. and Lee, G. J. (1999). *A Long-Run and Short-Run Component Model of Stock Return Volatility.* Cointegration, Causality, and Forecasting, Oxford University Press.
**Target:** V2.1

### HAR — Heterogeneous Autoregressive (Corsi model)
**Field:** Realized volatility / high-frequency finance
**What it does:** Captures volatility across daily/weekly/monthly horizons simultaneously with a parsimonious AR specification.
**Reference:** Corsi, F. (2009). *A Simple Approximate Long-Memory Model of Realized Volatility.* Journal of Financial Econometrics 7(2).
**Target:** V2.2

---

## 2. Control Theory — Robotics / Aerospace / Process Control

VECTOR currently implements a **PID controller on variance**. That's one of the most basic controllers in the field. Modern control theory has structurally more sophisticated tools that would be far more appropriate for VECTOR's use case — especially given that an SDE model of the dynamics already exists.

### MPC — Model Predictive Control
**Field:** Process control, robotics, autonomous vehicles
**What it does:** At each step, optimize the sequence of future corrections over a rolling horizon, given the model and a cost function. Respects constraints natively.
**Why VECTOR would benefit:** This is the single most valuable upgrade we could make. VECTOR already has an SDE drift model and a coherence observable. MPC on top of this would answer: "given what we know about how coherence drifts, what intervention sequence over the next 5 turns minimizes expected drift?" Currently VECTOR does myopic one-step correction. MPC would make it anticipatory.
**Reference:** Mayne, D. Q. (2014). *Model predictive control: Recent developments and future promise.* Automatica 50(12).
**Target:** V2.0 (highest-value single addition to the controller layer)

### LQR — Linear Quadratic Regulator
**Field:** Optimal control (classical)
**What it does:** Closed-form optimal control for linear systems under quadratic cost. Standard baseline.
**Reference:** Kalman, R. E. (1960). *Contributions to the Theory of Optimal Control.* Boletín de la Sociedad Matemática Mexicana.
**Target:** V1.9 (as the linearized-SDE controller to benchmark PID against before jumping to MPC)

### H∞ Control
**Field:** Robust control
**What it does:** Worst-case optimal control under model uncertainty. Designed for "we don't know the model exactly, do well anyway."
**Why VECTOR would benefit:** The SDE parameters aren't known precisely. H∞ would give correction strategies that perform well across a range of drift regimes, not just the one fitted.
**Reference:** Zhou, K. and Doyle, J. C. (1998). *Essentials of Robust Control.* Prentice Hall.
**Target:** V3

### Sliding Mode Control
**Field:** Nonlinear robust control
**What it does:** Discontinuous control law that forces the system onto a target manifold regardless of disturbances. Very aggressive corrections.
**Why VECTOR would benefit:** For hard-stop integrity-breach events where PID's smooth correction is inadequate.
**Reference:** Utkin, V. I. (1977). *Variable structure systems with sliding modes.* IEEE Transactions on Automatic Control 22(2).
**Target:** V2.5

### Contraction Analysis
**Field:** Nonlinear stability theory
**What it does:** Modern alternative to Lyapunov functions for proving convergence of nonlinear systems.
**Why VECTOR would benefit:** We currently compute a "Lyapunov bound" as a single scalar. Contraction analysis would give a richer picture of where in the state space the controller is stable and where it isn't.
**Reference:** Lohmiller, W. and Slotine, J.-J. E. (1998). *On Contraction Analysis for Non-linear Systems.* Automatica 34(6).
**Target:** V3

### Reachability Analysis
**Field:** Formal methods, hybrid systems
**What it does:** Compute the set of states a system can reach from a given initial condition over a given time horizon.
**Why VECTOR would benefit:** Would allow formal statements like "from the current state, there is no intervention sequence that can return the session below σ² = X within 5 turns." This transforms Integrity Floor from a threshold into a proof.
**Reference:** Althoff, M. (2013). *Reachability Analysis of Nonlinear Systems Using Conservative Polynomialization and Non-Convex Sets.* HSCC.
**Target:** V3

---

## 3. Information Theory

VECTOR has Shannon entropy, Jensen-Shannon divergence, Bhattacharyya overlap (mislabeled as MI until V1.8.1), Fisher information, and Kolmogorov/LZ complexity proxy. Several foundational measures are absent.

### Transfer Entropy
**Field:** Information theory / causal inference
**What it does:** Measures **directional** information flow from one time series to another. Asymmetric — TE(X→Y) ≠ TE(Y→X).
**Why VECTOR would benefit:** Answers the directly useful question: is the user's input driving the AI's drift, or is the AI's drift driving the user's adaptation? Currently VECTOR treats both sides as one coupled stream. Transfer entropy would unbundle them.
**Reference:** Schreiber, T. (2000). *Measuring Information Transfer.* Physical Review Letters 85(2).
**Target:** V2.0 (pair with Granger causality below — same use case, different technique)

### Granger Causality
**Field:** Econometrics / time-series
**What it does:** Classical statistical test for whether one time series predicts another beyond its own history.
**Why VECTOR would benefit:** For the V1.8.0 causal delta measurement to be published as a real claim, Granger causality is the standard statistical test reviewers will expect to see. We collect the data. Don't yet have the test.
**Reference:** Granger, C. W. J. (1969). *Investigating Causal Relations by Econometric Models and Cross-spectral Methods.* Econometrica 37(3).
**Target:** V1.9 (required for real publication of causal delta results)

### Proper Shannon Mutual Information (via k-NN)
**Field:** Information theory
**What it does:** Actual MI between continuous variables via k-nearest-neighbor estimators. Does not require binning or parametric assumptions.
**Why VECTOR would benefit:** Replaces `computeContextualOverlap` (Bhattacharyya proxy) with the real thing once semantic embeddings are in place.
**Reference:** Kraskov, Stögbauer, Grassberger (2004). *Estimating Mutual Information.* Physical Review E 69(6).
**Target:** V2.0 (gated on semantic embeddings being live)

### KL Divergence (asymmetric)
**Field:** Information theory
**What it does:** Directional distributional distance. JSD is its symmetrized form.
**Why VECTOR would benefit:** Sometimes the asymmetry matters — how much information is lost going from context to response, separately from how much is lost in reverse.
**Reference:** Kullback, S. and Leibler, R. A. (1951). *On Information and Sufficiency.* Annals of Mathematical Statistics 22(1).
**Target:** V1.9 (trivial addition, already implicitly computed inside JSD)

### Cross-Entropy
**Field:** Information theory / ML
**What it does:** Expected log-loss of one distribution under another.
**Reference:** Cover, T. M. and Thomas, J. A. (2006). *Elements of Information Theory*, 2nd ed., Wiley.
**Target:** V1.9

---

## 4. Time-Series Forecasting — Classical Statistics

VECTOR has no explicit forecasting model for future coherence scores. The SDE provides dynamics but no point forecast with confidence intervals.

### ARMA / ARIMA Models
**Field:** Classical time-series
**What it does:** Autoregressive Moving Average with Integration — the workhorse of time-series forecasting for decades.
**Why VECTOR would benefit:** Principled short-horizon coherence forecasts with calibrated confidence intervals. Answers "where is this session heading over the next 3 turns?" before those turns happen.
**Reference:** Box, G. E. P. and Jenkins, G. M. (1970). *Time Series Analysis: Forecasting and Control.*
**Target:** V2.0

### HMM — Hidden Markov Models
**Field:** Statistical signal processing, speech recognition
**What it does:** Infers discrete latent states (CALM / NOMINAL / CAUTION / DECOHERENCE) probabilistically from observations, rather than thresholding.
**Why VECTOR would benefit:** VECTOR's regime classification is currently hard-thresholded on σ². HMM would infer regimes probabilistically with proper transition dynamics, and make probabilistic regime forecasts.
**Reference:** Rabiner, L. R. (1989). *A tutorial on hidden Markov models and selected applications in speech recognition.* Proceedings of the IEEE 77(2).
**Target:** V2.1

### CUSUM — Cumulative Sum Control Chart
**Field:** Statistical process control / change-point detection
**What it does:** Detects when a process mean shifts, in real time, with formal false-alarm rate guarantees.
**Why VECTOR would benefit:** "When exactly did the drift start?" is currently answered by a threshold crossing. CUSUM would give a formal change-point estimate with a proper ARL (average run length) guarantee.
**Reference:** Page, E. S. (1954). *Continuous Inspection Schemes.* Biometrika 41.
**Target:** V1.9

### BOCPD — Bayesian Online Change-Point Detection
**Field:** Bayesian statistics
**What it does:** Modern probabilistic alternative to CUSUM. Computes the posterior distribution over change-point times online.
**Reference:** Adams, R. P. and MacKay, D. J. C. (2007). *Bayesian Online Changepoint Detection.* arXiv:0710.3742.
**Target:** V2.0

### Gaussian Processes (for trajectory forecasting)
**Field:** Bayesian ML
**What it does:** Non-parametric forecasting with principled uncertainty quantification over the whole future trajectory.
**Reference:** Rasmussen, C. E. and Williams, C. K. I. (2006). *Gaussian Processes for Machine Learning.* MIT Press.
**Target:** V2.5

---

## 5. Signal Processing — DSP

VECTOR uses Kalman filtering for state estimation but no frequency-domain analysis and no classical smoothing filters.

### FFT / Periodogram / Spectral Analysis
**Field:** Digital signal processing
**What it does:** Decomposes a time series into frequency components. Reveals cyclic patterns.
**Why VECTOR would benefit:** Creative and research sessions often show cyclic coherence patterns (e.g. "productive-then-divergent" loops). These show up as peaks in the power spectrum but are invisible in time-domain metrics.
**Reference:** Cooley, J. W. and Tukey, J. W. (1965). *An Algorithm for the Machine Calculation of Complex Fourier Series.* Mathematics of Computation 19(90).
**Target:** V2.0

### Wavelet Transform
**Field:** Time-frequency analysis
**What it does:** Localized frequency analysis — unlike FFT, knows *when* each frequency component occurred.
**Reference:** Daubechies, I. (1992). *Ten Lectures on Wavelets.* SIAM.
**Target:** V2.5

### Savitzky-Golay Filter
**Field:** Signal processing
**What it does:** Smoothing via local polynomial fit. Preserves peak heights and widths better than moving average.
**Reference:** Savitzky, A. and Golay, M. J. E. (1964). *Smoothing and Differentiation of Data by Simplified Least Squares Procedures.* Analytical Chemistry 36.
**Target:** V1.9

### Particle Smoother
**Field:** Sequential Monte Carlo
**What it does:** Backward pass over a particle filter to smooth past state estimates using future observations.
**Why VECTOR would benefit:** VECTOR has a forward particle filter. A backward smoother would give higher-quality historical state estimates for the research CSV exports.
**Reference:** Godsill, S. J., Doucet, A., West, M. (2004). *Monte Carlo Smoothing for Nonlinear Time Series.* JASA 99(465).
**Target:** V2.0

---

## 6. Statistical Inference — Hypothesis Testing for V1.8.0 Causal Delta

The V1.8.0 causal delta measurement accumulates data but lacks the hypothesis-testing infrastructure to analyze it validly. This is the single biggest gap for publishing VECTOR's actual results.

### Sequential Hypothesis Testing (SPRT / mSPRT)
**Field:** Sequential analysis
**What it does:** Adaptive testing — stop collecting data as soon as enough evidence has accumulated, rather than at a fixed sample size. Maintains false-positive rate.
**Why VECTOR would benefit:** Causal delta data accumulates online across sessions. SPRT is the mathematically correct way to run a test on streaming data.
**Reference:** Wald, A. (1945). *Sequential Tests of Statistical Hypotheses.* Annals of Mathematical Statistics 16(2); Johari, Pekelis, Walsh (2015). *Always Valid Inference.* arXiv:1512.04922.
**Target:** V2.0

### Causal Inference — Beyond Granger
**Field:** Causal inference
**What it does:** Formal frameworks (do-calculus, potential outcomes) for inferring causal effects from observational data.
**Reference:** Pearl, J. (2009). *Causality: Models, Reasoning, and Inference.* Cambridge; Imbens, G. and Rubin, D. (2015). *Causal Inference for Statistics, Social, and Biomedical Sciences.*
**Target:** V3 (research-grade)

---

## 7. Anomaly Detection

VECTOR's drift detection is implicitly anomaly detection but uses none of the standard techniques.

### Mahalanobis Distance
**Field:** Multivariate statistics
**What it does:** Distance measure accounting for covariance structure. Identifies multivariate outliers.
**Why VECTOR would benefit:** VECTOR tracks 15+ metrics per turn and thresholds them individually. Mahalanobis distance on the joint distribution is the natural multivariate generalization — catches outliers that no single metric flags.
**Reference:** Mahalanobis, P. C. (1936). *On the generalised distance in statistics.* Proceedings of the National Institute of Sciences of India 2(1).
**Target:** V1.9

### Isolation Forest
**Field:** Modern anomaly detection
**What it does:** Ensemble method — anomalies are points that get isolated (separated from others) faster than normal points in random partitions.
**Reference:** Liu, F. T., Ting, K. M., Zhou, Z.-H. (2008). *Isolation Forest.* ICDM.
**Target:** V2.0

### One-Class SVM
**Field:** Machine learning
**What it does:** Learn the boundary of "normal" coherence trajectories from training data; flag anything outside.
**Reference:** Schölkopf et al. (2001). *Estimating the Support of a High-Dimensional Distribution.* Neural Computation 13(7).
**Target:** V2.0

### Autoencoder Reconstruction Error
**Field:** Deep learning
**What it does:** Train a neural autoencoder on normal session trajectories; anomalies produce high reconstruction error.
**Reference:** Hinton, G. E. and Salakhutdinov, R. R. (2006). *Reducing the Dimensionality of Data with Neural Networks.* Science 313.
**Target:** V2.5

---

## 8. Deep Learning for Time-Series

Fair to omit from a minimal research prototype. Listed here so readers know the landscape exists and where the boundary is.

### LSTM / GRU / Transformer Time-Series Models
**Field:** Deep learning
**What they do:** Learn drift patterns directly from data rather than hand-specifying an SDE.
**References:** Hochreiter & Schmidhuber 1997 (LSTM); Cho et al. 2014 (GRU); Vaswani et al. 2017 (Transformer); Zhou et al. 2021 (Informer — long-range time-series Transformer, AAAI).
**Target:** V3+

### Temporal Convolutional Networks
**Field:** Deep learning
**What they do:** Causal dilated convolutions for sequence modeling. Often outperform RNNs on time-series benchmarks.
**Reference:** Bai, S., Kolter, J. Z., Koltun, V. (2018). *An Empirical Evaluation of Generic Convolutional and Recurrent Networks for Sequence Modeling.* arXiv:1803.01271.
**Target:** V3+

### Neural ODEs / Neural SDEs
**Field:** Deep learning × differential equations
**What they do:** Learn the drift/diffusion functions of an SDE from data rather than specifying them analytically.
**Why VECTOR would benefit:** Our SDE has fixed analytical form. Neural SDE variants would let the drift function itself be learned per-domain.
**Reference:** Chen et al. (2018). *Neural Ordinary Differential Equations.* NeurIPS; Li et al. (2020). *Scalable Gradients for Stochastic Differential Equations.* AISTATS.
**Target:** V3+

---

## 9. Cross-Domain Application Layers

These aren't "missing formulas" — they're application-layer rebuilds of VECTOR for other domains. Enumerated so the scope of what's possible is visible.

- **VECTOR-Finance** — drift detection on trading-strategy parameter updates. GARCH is already in; needs domain-specific scoring layer, regulatory guardrails, and a realistic baseline-vs-policy evaluation harness.
- **VECTOR-Agent** — drift detection across multi-step AI agent chains. Scoring layer: step-to-goal alignment rather than text coherence.
- **VECTOR-Clinical** — drift detection on clinical reasoning chains. Requires validation against physician-labeled cases; regulatory path is substantial. Not a weekend project.
- **VECTOR-Autonomous** — drift detection on autonomous-vehicle decision streams. Requires real-time guarantees VECTOR doesn't currently provide.
- **VECTOR-Code** — drift detection on AI code generation / review / refactor pipelines. Scoring layer: AST-level structural consistency rather than vocabulary overlap.

Each is its own project. None would be VECTOR as currently shipped; each would use VECTOR's mathematical chassis as the foundation.

---

## Ten-entry summary — what we'd fix first if we had resources

Ranked by impact-per-effort:

1. **Granger causality** (V2.x, statistics layer) — V1.9.0 implemented Mann-Whitney U, Fisher's exact, percentile bootstrap CI, and Benjamini-Hochberg correction, which cover the two-sample significance and multiple-comparison needs for the causal delta data. Granger causality specifically is still absent; it is the standard test reviewers expect for temporal causal claims (whether policy injection predicts subsequent coherence beyond the session's own autoregressive trend).
2. **EGARCH or GJR-GARCH** (V1.9, variance asymmetry) — addresses the biggest math gap with the smallest engineering cost.
3. **CUSUM change-point detector** (V1.9, where did drift start?) — formal answer to a question users already ask.
4. **Transfer entropy** (V2.0, user vs AI contribution to drift) — unbundles a coupled measurement.
5. **MPC controller** (V2.0, anticipatory corrections) — the highest-value controller upgrade given we already have an SDE model.
6. **Mahalanobis distance** (V1.9, multivariate anomaly detection) — free statistical power from the metrics we already collect.
7. **ARMA short-horizon forecasting** (V2.0, where is the session heading?) — long-requested capability.
8. **Savitzky-Golay smoothing** (V1.9, nicer charts) — small quality-of-life fix.
9. **KL divergence + cross-entropy** (V1.9, minor information-theory cleanup) — rounds out the symmetric/asymmetric story.
10. **HMM regime inference** (V2.1, probabilistic regime classification) — replaces threshold-based state labels with proper probabilistic inference.

---

## What isn't on this list

Not every addition makes sense. Some specific things we've considered and deliberately **not** put on the roadmap:

- **Reinforcement learning–based correction policies.** Tempting because the setup (state, action, observed reward via causal delta) fits cleanly. Deliberately excluded because an RL policy would be significantly harder to audit than the current rule-based approach, which cuts against the V1.8.0 "audit your own corrections" thesis.
- **Large language models inside the SDK.** VECTOR measures LLMs; it shouldn't embed one. Adding a secondary LLM as an internal critic would create circular evaluation loops.
- **Proprietary / closed-source additions.** Anything that can't be MIT-licensed and public doesn't go in.

---

*Every item above represents work that domain experts in those fields would be far better positioned to implement than we would. VECTOR's mathematical chassis is open source, MIT licensed, and deliberately constructed so domain-specific layers can be rebuilt without asking permission. If you're working in one of these fields and want to pick up an item, the code is waiting.*

*© 2026 Hudson & Perry Research*
