/**
 * VECTOR SDK — AutoTune Module
 * © 2026 Hudson & Perry Research · MIT License
 *
 * Context-adaptive parameter selection (temperature, top_p, frequency_penalty)
 * based on message type detection + user feedback learning.
 *
 * Five context types: code · creative · analytical · conversational · chaotic
 *
 * Previously lived only in VECTOR.jsx. Ported to SDK in V1.8.1 so Node.js
 * pipeline consumers can apply the same logic without the React shell.
 */

import type { Message } from './coherence';

// ── Profile Defaults ─────────────────────────────────────────
export type ContextType = 'code' | 'creative' | 'analytical' | 'conversational' | 'chaotic';

export interface SamplingParams {
  temperature:       number;
  top_p:             number;
  frequency_penalty: number;
}

export const AT_PROFILES: Record<ContextType, SamplingParams> = {
  code:           { temperature: 0.15, top_p: 0.80, frequency_penalty: 0.20 },
  creative:       { temperature: 1.15, top_p: 0.95, frequency_penalty: 0.50 },
  analytical:     { temperature: 0.40, top_p: 0.88, frequency_penalty: 0.20 },
  conversational: { temperature: 0.75, top_p: 0.90, frequency_penalty: 0.10 },
  chaotic:        { temperature: 1.70, top_p: 0.99, frequency_penalty: 0.80 },
};

const AT_PATTERNS: Record<ContextType, RegExp[]> = {
  code: [
    /\b(code|function|class|bug|error|debug|api|algorithm|typescript|javascript|python|sql|json|import|export|async|await|interface|const|let|var)\b/i,
    /```[\s\S]*```/,
    /[{}();=><]/,
  ],
  creative: [
    /\b(write|story|poem|creative|imagine|fiction|character|plot|lyrics|song|brainstorm|roleplay|act as)\b/i,
  ],
  analytical: [
    /\b(analyze|compare|evaluate|assess|research|review|data|statistics|explain|summarize)\b/i,
  ],
  conversational: [
    /\b(hey|hi|hello|thanks|cool|nice|lol|chat|opinion|feel|believe)\b/i,
    /^.{0,30}$/,
  ],
  chaotic: [
    /\b(chaos|random|wild|crazy|absurd|glitch|entropy)\b/i,
    /(!{3,}|\?{3,})/,
  ],
};

// ── Context Detection ────────────────────────────────────────
export interface ContextResult {
  type:       ContextType;
  confidence: number;
}

/**
 * Detect the context type of a user message by pattern-matching against
 * five reference regex banks. Current message weighted 3×, last 4 history
 * messages weighted 1× each.
 *
 * Confidence is the share of total pattern hits captured by the top type.
 * Returns conversational + 0.5 confidence when no patterns match.
 */
export function detectMsgContext(msg: string, history: Message[]): ContextResult {
  const scores: Record<ContextType, number> = {
    code: 0, creative: 0, analytical: 0, conversational: 0, chaotic: 0,
  };
  const chk = (t: string, w: number) => {
    for (const [ctx, pats] of Object.entries(AT_PATTERNS) as [ContextType, RegExp[]][]) {
      for (const p of pats) if (p.test(t)) scores[ctx] += w;
    }
  };
  chk(msg, 3);
  (history || []).slice(-4).forEach(m => {
    const text = typeof m.content === 'string' ? m.content : '';
    chk(text, 1);
  });
  const entries = Object.entries(scores) as [ContextType, number][];
  const best    = entries.sort((a, b) => b[1] - a[1])[0];
  const total   = entries.reduce((a, [,v]) => a + v, 0);
  return { type: best[0], confidence: total > 0 ? best[1] / total : 0.5 };
}

// ── Feedback Profile Learning ─────────────────────────────────
export interface LearnedProfile {
  contextType:     ContextType;
  sampleCount:     number;
  positiveCount:   number;
  negativeCount:   number;
  positiveParams:  SamplingParams;
  negativeParams:  SamplingParams;
  adjustments:     Partial<SamplingParams>;
  lastUpdated:     number;
}

export interface FeedbackState {
  history:         Array<{ ts: number; context: ContextType; rating: 1 | -1; params: SamplingParams }>;
  learnedProfiles: Record<ContextType, LearnedProfile>;
}

const FB_NEUTRAL: SamplingParams = { temperature: 0.7, top_p: 0.9, frequency_penalty: 0.2 };

export function createFeedbackState(): FeedbackState {
  const lp = {} as Record<ContextType, LearnedProfile>;
  (['code', 'creative', 'analytical', 'conversational', 'chaotic'] as ContextType[]).forEach(ctx => {
    lp[ctx] = {
      contextType:    ctx,
      sampleCount:    0,
      positiveCount:  0,
      negativeCount:  0,
      positiveParams: { ...FB_NEUTRAL },
      negativeParams: { ...FB_NEUTRAL },
      adjustments:    {},
      lastUpdated:    0,
    };
  });
  return { history: [], learnedProfiles: lp };
}

function emaUpd(cur: SamplingParams, obs: SamplingParams, a: number): SamplingParams {
  const inv = 1 - a;
  return {
    temperature:       cur.temperature       * inv + obs.temperature       * a,
    top_p:             cur.top_p             * inv + obs.top_p             * a,
    frequency_penalty: cur.frequency_penalty * inv + obs.frequency_penalty * a,
  };
}

/**
 * Fold a single positive/negative rating into the feedback state.
 * Separate EMAs track rating-positive and rating-negative parameter sets;
 * adjustments are the per-parameter signed deltas scaled by 0.5.
 */
export function processFeedback(
  state:       FeedbackState,
  contextType: ContextType,
  rating:      1 | -1,
  params:      SamplingParams,
): FeedbackState {
  const prof = { ...state.learnedProfiles[contextType] };
  prof.sampleCount++;
  prof.lastUpdated = Date.now();
  if (rating === 1) {
    prof.positiveCount++;
    prof.positiveParams = emaUpd(prof.positiveParams, params, 0.3);
  } else {
    prof.negativeCount++;
    prof.negativeParams = emaUpd(prof.negativeParams, params, 0.3);
  }
  const adj: Partial<SamplingParams> = {};
  (Object.keys(FB_NEUTRAL) as (keyof SamplingParams)[]).forEach(k => {
    const d = (prof.positiveParams[k] - FB_NEUTRAL[k]) - (prof.negativeParams[k] - FB_NEUTRAL[k]);
    if (Math.abs(d * 0.5) > 0.01) adj[k] = d * 0.5;
  });
  prof.adjustments = adj;
  return { ...state, learnedProfiles: { ...state.learnedProfiles, [contextType]: prof } };
}

// ── AutoTune Core ────────────────────────────────────────────
export interface AutoTuneResult {
  params:     SamplingParams;
  type:       ContextType;
  confidence: number;
}

/**
 * Compute sampling parameters for a message, blending:
 *   1. The detected context profile (code/creative/etc.)
 *   2. A conversational fallback when confidence < 0.6
 *   3. Learned adjustments from user feedback (if ≥ 3 samples in bucket)
 *
 * All parameters are clamped:
 *   temperature ∈ [0, 2]
 *   top_p ∈ [0, 1]
 *   frequency_penalty ∈ [-2, 2]
 */
export function computeAutoTuneParams(
  msg:             string,
  history:         Message[],
  learnedProfiles?: Partial<Record<ContextType, LearnedProfile>>,
): AutoTuneResult {
  const { type, confidence } = detectMsgContext(msg, history);
  let p: SamplingParams = { ...AT_PROFILES[type] };

  if (confidence < 0.6) {
    const bal = AT_PROFILES.conversational;
    const w   = confidence / 0.6;
    p = {
      temperature:       p.temperature       * w + bal.temperature       * (1 - w),
      top_p:             p.top_p             * w + bal.top_p             * (1 - w),
      frequency_penalty: p.frequency_penalty * w + bal.frequency_penalty * (1 - w),
    };
  }

  const lp = (learnedProfiles || {})[type];
  if (lp && lp.sampleCount >= 3) {
    const wt = Math.min((lp.sampleCount / 20) * 0.5, 0.5);
    (Object.keys(p) as (keyof SamplingParams)[]).forEach(k => {
      if (lp.adjustments && lp.adjustments[k] != null) {
        p[k] += (lp.adjustments[k] as number) * wt;
      }
    });
  }

  p.temperature       = Math.min(Math.max(p.temperature,        0),  2);
  p.top_p             = Math.min(Math.max(p.top_p,              0),  1);
  p.frequency_penalty = Math.min(Math.max(p.frequency_penalty, -2),  2);

  return { params: p, type, confidence };
}
