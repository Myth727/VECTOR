/**
 * VECTOR SDK — Volatility-Sensitive Correction Engine
 * © 2026 Hudson & Perry Research · MIT License
 *
 * VERSION NOTE: This SDK is updated alongside VECTOR.jsx releases but may
 * occasionally lag by one version between releases. The definitive source
 * of truth for the complete implementation is always VECTOR.jsx.
 * For the full UI + engine, use VECTOR.jsx or deploy via Vercel.
 * For headless offline scoring, see tools/vector_harness.py.
 *
 * Quick start:
 *   import { computeCoherence, kalmanStep, buildPipeInjection, PRESETS } from './index';
 *
 *   const cfg    = PRESETS.TECHNICAL;
 *   const score  = computeCoherence(response, history);
 *   const newVar = updateSmoothedVariance(scoreHistory, prev, cfg);
 *   const kalman = kalmanStep(state, score, turn * (2*Math.PI/12), SDE_PARAMS);
 *   const pipe   = buildPipeInjection({
 *                    smoothedVar: newVar, kalmanX: kalman.x, kalmanP: kalman.P,
 *                    calmStreak, driftCount, harnessMode: 'audit', turn,
 *                    hSignalCount: 0, bSignalCount: 0, adaptedSigma: null,
 *                  });
 *
 * cfg threading (V1.5.9-V1.5.13):
 *   All key functions accept an optional Partial<PresetConfig> as their last
 *   param. Pass PRESETS.MEDICAL, PRESETS.CREATIVE etc. for preset-specific
 *   thresholds. All functions fall back to module-level defaults when omitted.
 */

// ── Constants — all exposed, none locked ────────────────────────
export * from './constants';
export type { PresetConfig } from './constants';

// ── SDE simulation and Kalman filter ────────────────────────────
export {
  simulateSDE,
  simulateCIR,
  simulateHeston,
  simulateVasicek,
  simulateSABR,
  sdePercentilesAtStep,
  normalizePaths,
  kalmanStep,
  ekfStep,
  levyNoise,
  computeLyapunovBound,
} from './sde';
export type { SDEParams, KalmanState, LyapunovResult } from './sde';

// ── Coherence scoring ───────────────────────────────────────────
export {
  tokenize,
  getTextFromContent,
  buildTermFreq,
  tfidfSimilarity,
  jensenShannonDivergence,
  computeCoherence,
  cosineSimilarityVec,
  computeSemanticCoherenceFromEmbeddings,
  DEFAULT_WEIGHTS,
} from './coherence';
export type { CoherenceWeights, Message, ContentBlock } from './coherence';

// ── GARCH variance and Drift Law ─────────────────────────────────
export {
  updateSmoothedVariance,  // cfg → per-preset GARCH params (V1.5.3)
  driftLawCapEff,
  driftLawFloor,
  applyZeroDriftLock,
  computePIDCorrection,    // P-I-D on variance — output > 2.0 = over-correction risk
  computeRealizedVolatility, // rolling squared returns
  stabledrlClipScore,      // unconditional score clipping (Li et al. 2026)
  stabledrlNormalizeVar,   // self-normalizing variance scaling
} from './drift';
export type { PIDResult } from './drift';

// ── Signal detection ─────────────────────────────────────────────
export {
  assessBehavioralSignals,
  assessHallucinationSignals,  // cfg → preset varCaution threshold (V1.5.11)
  detectConfidenceLanguage,
  checkSourceConsistency,
  checkSelfContradiction,
  computeResponseEntropy,      // V1.8.0 — Shannon entropy of response tokens
  computeVocabGrowthRate,      // V1.8.0 — fraction of novel tokens vs session prior
  computeContextualOverlap,    // V1.8.1 — correctly-named Bhattacharyya overlap
  computeMutualInformation,    // @deprecated V1.8.1 — alias for computeContextualOverlap
  computeFisherInformation,    // rate of distribution change per turn
  computeKolmogorovProxy,      // LZ complexity ratio
  computeBerryPhase,           // geometric phase proxy on session trajectory
  computeSHETorque,            // variance-coupled stabilization proxy
  computeEWMATrend,            // exponentially weighted moving average
} from './signals';
export type {
  BehavioralSignal,
  BehavioralAssessment,
  HallucinationAssessment,
  EWMAResult,
} from './signals';

// ── Per-turn metrics (V1.8.1 parity module) ─────────────────────
export {
  computeAnchorDistance,             // slow-burn drift vs session anchor (first 3 turns)
  computeInnovationAutocorrelation,  // Kalman model-fit check (Box & Jenkins 1970)
  computeEfficiencyRatio,            // information density per token
} from './metrics';

// ── AutoTune (V1.8.1 parity module) ─────────────────────────────
export {
  AT_PROFILES,
  detectMsgContext,
  computeAutoTuneParams,
  createFeedbackState,
  processFeedback,
} from './autotune';
export type {
  ContextType,
  SamplingParams,
  ContextResult,
  LearnedProfile,
  FeedbackState,
  AutoTuneResult,
} from './autotune';

// ── Causal delta & shadow baseline ──────────────────────────────
// Trajectory-based counterfactual measurement for policy effectiveness.
// Replaces the level-delta baseline with matched forward-delta windows.
// P(recovery) = P(C_{t+k} > 0.60 for some k ≤ 3 | C_t < 0.50).
// Pre-requisite for any causal claim about VECTOR policy effectiveness.
export {
  propagateForwardDeltas,  // per-turn retroactive forward-delta update
  computeShadowStats,      // policy-vs-baseline forward-delta aggregates by lag & bin
  summarizeShadowStats,    // flatten to single-line summary for display
  extractRawBuckets,       // per-(lag, bin) raw forward-delta arrays (consumed by stats)
  extractPooledDeltas,     // pooled forward deltas for overall bootstrap
  coherenceBin,            // low (<0.50) / mid (<0.75) / high
  BIN_EDGE_LOW,
  BIN_EDGE_MID,
  DRIFT_THRESHOLD,
  RECOVERY_THRESHOLD,
  RECOVERY_WINDOW,
  MAX_LAG,
  MIN_COMPARE,
} from './causal';
export type {
  CoherenceBin,
  ForwardDeltaMap,
  ShadowEntry,
  ArmStats,
  ShadowStats,
  ShadowSummary,
} from './causal';

// ── Statistical test layer ──────────────────────────────────────
// Mann-Whitney U (rank-sum, tie-corrected), Fisher's exact (2×2),
// percentile bootstrap CI on mean difference, Benjamini-Hochberg FDR.
// Consumes extractRawBuckets / extractPooledDeltas output from causal.
// Use compareArms for pooled recovery test, runCellTests for per-cell MW+BH.
export {
  mannWhitneyU,
  fisherExact,
  bootstrapMeanDiffCI,
  benjaminiHochberg,
  compareArms,
  runCellTests,
  erf,
  normalTwoSidedP,
  mulberry32,
} from './stats';
export type {
  MWResult,
  FisherResult,
  BootstrapResult,
  BHResult,
  CellTestResult,
  ArmComparisonReport,
} from './stats';

// ── Reliability & failure probability ───────────────────────────
// Classical reliability math (Feller 1968) — Murphy's Law, Law of
// Total Probability, n-for-target-failure, series failure, Laplace-
// smoothed rate estimate. Advanced-tier satirical Sod's Law (Wiseman
// 2004) and entropy narrative wrapper — both display-only, not
// calibrated physics. See module header for full rationale.
export {
  probFailureN,
  totalProbability,
  nForTargetFailure,
  componentFailureAny,
  estimatePerTurnRate,
  sodsLawScore,
  entropyDriftNarrative,
  SODS_LAW_MIN,
  SODS_LAW_MAX,
  SODS_LAW_CAP,
} from './reliability';
export type {
  FailureProbResult,
  NForTargetResult,
  SodsLawInput,
  SodsLawResult,
  EntropyNarrativeResult,
} from './reliability';

// ── Engine: pipe injection, RAG, health, pruning ─────────────────
export {
  buildPipeInjection,       // cfg → preset var thresholds (V1.5.9)
  detectMuteMode,
  buildMuteInjection,       // cfg → muteMaxTokens; word limit cap*0.75 (V1.5.4)
  buildDriftGateInjection,  // cfg → preset thresholds + word limit (V1.5.3)
  buildRagEntry,
  ragRetrieve,
  formatRagContext,
  computeSessionHealth,     // cfg → health penalty weights
  pruneContext,             // cfg → pruneThreshold/pruneKeep
} from './engine';
export type {
  PipeState,
  RagEntry,
  CoherenceDataPoint,
} from './engine';

// ── Storage polyfill ─────────────────────────────────────────────
export { storage } from './storage';
export type { StorageAdapter, StorageResult } from './storage';
