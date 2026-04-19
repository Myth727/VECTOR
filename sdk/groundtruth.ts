/**
 * VECTOR SDK — Ground-Truth Storage & Signal Validation
 * © 2026 Hudson & Perry Research · MIT License
 *
 * Three-source ground truth for VECTOR's coherence signals.
 *
 * The V1.8.x/V1.9.0 causal delta layer measures whether VECTOR's policy
 * correlates with its own internal coherence score. That is circular
 * unless something external tells us whether the coherence score itself
 * tracks reality. This module provides that external anchor in three
 * combined sources:
 *
 *   1. TASK-GROUNDED SESSIONS — sessions with verifiable tasks (math,
 *      code that runs/fails, factual Q&A with known answers).
 *      Ground truth = task correct / task wrong.
 *
 *   2. HUMAN LABELS — user or rater tags on a per-turn basis, post-hoc.
 *      Labels: 'good' | 'drifted' | 'failed' | 'off_topic' | 'hallucinated'
 *      Most rigorous, slowest.
 *
 *   3. "SOMETHING'S OFF" FLAGS — user-initiated per-turn flags from a UI
 *      button distinct from thumbs up/down. Thumbs = preference
 *      (liked / disliked the style). This button = suspected factual or
 *      grounding failure. Cheapest signal, medium-reliable.
 *
 * All three are persisted via the storage polyfill (`sdk/storage.ts`)
 * under a namespaced key prefix. Analysis joins them against the
 * coherence trajectory at the matching turn to produce a signal
 * validation report: does low C actually co-occur with ground-truth
 * failure?
 *
 * Pre-requisite (per ChatGPT review) for the V2 validation experiment.
 * Until ground truth is external, the experiment cannot produce a
 * defensible causal claim.
 */

import { storage } from './storage';

// ── Key namespacing ──────────────────────────────────────────────

export const GT_KEY_PREFIX      = 'vector:gt:';
export const GT_TASK_PREFIX     = GT_KEY_PREFIX + 'task:';        // + sessionId:taskId
export const GT_LABEL_PREFIX    = GT_KEY_PREFIX + 'label:';       // + sessionId:turnIndex
export const GT_FLAG_PREFIX     = GT_KEY_PREFIX + 'flag:';        // + sessionId:turnIndex

// ── Types ────────────────────────────────────────────────────────

export type TaskType = 'math' | 'code' | 'factual_qa' | 'other';

export type HumanLabelValue =
  | 'good'
  | 'drifted'
  | 'failed'
  | 'off_topic'
  | 'hallucinated';

export interface TaskGroundedEntry {
  sessionId:        string;
  turnIndex:        number;
  timestamp:        number;
  taskId:           string;
  taskType:         TaskType;
  taskPrompt:       string;
  expectedAnswer:   string;
  modelResponse:    string;
  correct:          boolean;
  coherenceAtTurn?: number;  // C score at time of response
  notes?:           string;
}

export interface HumanLabel {
  sessionId:        string;
  turnIndex:        number;
  timestamp:        number;
  label:            HumanLabelValue;
  raterId?:         string;
  coherenceAtTurn?: number;
  notes?:           string;
}

export interface NotGroundedFlag {
  sessionId:        string;
  turnIndex:        number;
  timestamp:        number;
  coherenceAtTurn?: number;
  note?:            string;
}

export interface GroundTruthExport {
  tasks:    TaskGroundedEntry[];
  labels:   HumanLabel[];
  flags:    NotGroundedFlag[];
  version:  string;
  exportedAt: number;
}

export interface SignalValidationReport {
  // How well does low coherence predict ground-truth failure?
  n:                 number;
  truePositives:     number;   // low C AND failed
  falsePositives:    number;   // low C AND succeeded
  trueNegatives:     number;   // high C AND succeeded
  falseNegatives:    number;   // high C AND failed
  precision:         number | null;
  recall:            number | null;
  f1:                number | null;
  accuracy:          number | null;
  // Mean C within each ground-truth class
  meanCFailed:       number | null;
  meanCSucceeded:    number | null;
  deltaCClasses:     number | null;  // meanCSucceeded − meanCFailed
  // Source breakdown
  sourceCounts:      { tasks: number; labels: number; flags: number };
}

// ── Sanitizers ───────────────────────────────────────────────────

function sanitizeKeyPart(s: string): string {
  // Storage keys cannot contain whitespace, /, \, or quotes.
  return String(s).replace(/[\s/\\'"]/g, '_');
}

// ── Writes ───────────────────────────────────────────────────────

export async function storeTaskEntry(entry: TaskGroundedEntry): Promise<boolean> {
  try {
    const key = GT_TASK_PREFIX + sanitizeKeyPart(entry.sessionId)
              + ':' + sanitizeKeyPart(entry.taskId);
    const res = await storage.set(key, JSON.stringify(entry));
    return res !== null;
  } catch { return false; }
}

export async function storeHumanLabel(label: HumanLabel): Promise<boolean> {
  try {
    const key = GT_LABEL_PREFIX + sanitizeKeyPart(label.sessionId)
              + ':' + label.turnIndex;
    const res = await storage.set(key, JSON.stringify(label));
    return res !== null;
  } catch { return false; }
}

export async function storeNotGroundedFlag(flag: NotGroundedFlag): Promise<boolean> {
  try {
    const key = GT_FLAG_PREFIX + sanitizeKeyPart(flag.sessionId)
              + ':' + flag.turnIndex;
    const res = await storage.set(key, JSON.stringify(flag));
    return res !== null;
  } catch { return false; }
}

// ── Reads ────────────────────────────────────────────────────────

async function readAllUnderPrefix<T>(prefix: string): Promise<T[]> {
  try {
    const listed = await storage.list(prefix);
    if (!listed || !listed.keys || listed.keys.length === 0) return [];
    const out: T[] = [];
    for (const key of listed.keys) {
      const got = await storage.get(key);
      if (got && got.value) {
        try { out.push(JSON.parse(got.value) as T); } catch { /* skip corrupt */ }
      }
    }
    return out;
  } catch { return []; }
}

export async function retrieveTaskEntries(sessionId?: string): Promise<TaskGroundedEntry[]> {
  const prefix = sessionId
    ? GT_TASK_PREFIX + sanitizeKeyPart(sessionId) + ':'
    : GT_TASK_PREFIX;
  return readAllUnderPrefix<TaskGroundedEntry>(prefix);
}

export async function retrieveHumanLabels(sessionId?: string): Promise<HumanLabel[]> {
  const prefix = sessionId
    ? GT_LABEL_PREFIX + sanitizeKeyPart(sessionId) + ':'
    : GT_LABEL_PREFIX;
  return readAllUnderPrefix<HumanLabel>(prefix);
}

export async function retrieveNotGroundedFlags(sessionId?: string): Promise<NotGroundedFlag[]> {
  const prefix = sessionId
    ? GT_FLAG_PREFIX + sanitizeKeyPart(sessionId) + ':'
    : GT_FLAG_PREFIX;
  return readAllUnderPrefix<NotGroundedFlag>(prefix);
}

export async function exportGroundTruth(
  sessionId?: string,
  version: string = 'V2.0.0'
): Promise<GroundTruthExport> {
  const [tasks, labels, flags] = await Promise.all([
    retrieveTaskEntries(sessionId),
    retrieveHumanLabels(sessionId),
    retrieveNotGroundedFlags(sessionId),
  ]);
  return { tasks, labels, flags, version, exportedAt: Date.now() };
}

// ── Signal validation ────────────────────────────────────────────

/**
 * Given an export + a coherence threshold τ (default 0.50), compute how
 * well "C < τ" predicts ground-truth failure.
 *
 * Each ground-truth entry is classified as:
 *   - failed:    tasks where correct===false, labels in {drifted, failed,
 *                off_topic, hallucinated}, all "something's off" flags
 *   - succeeded: tasks where correct===true, labels === 'good'
 *
 * Entries without an associated coherenceAtTurn are skipped (cannot
 * correlate without that field).
 *
 * Returns precision, recall, F1, accuracy, plus mean C per class.
 *
 * If n<5 in either class, reports but flags via null fields.
 */
export function validateSignals(
  gtExport: GroundTruthExport,
  tauC: number = 0.50
): SignalValidationReport {
  type Pair = { c: number; failed: boolean };
  const pairs: Pair[] = [];

  for (const t of gtExport.tasks) {
    if (typeof t.coherenceAtTurn !== 'number') continue;
    pairs.push({ c: t.coherenceAtTurn, failed: !t.correct });
  }
  for (const lab of gtExport.labels) {
    if (typeof lab.coherenceAtTurn !== 'number') continue;
    const failed = lab.label !== 'good';
    pairs.push({ c: lab.coherenceAtTurn, failed });
  }
  for (const f of gtExport.flags) {
    if (typeof f.coherenceAtTurn !== 'number') continue;
    // "Something's off" flags always count as a failure instance
    pairs.push({ c: f.coherenceAtTurn, failed: true });
  }

  let tp = 0, fp = 0, tn = 0, fn = 0;
  let sumFailed = 0, sumSucceeded = 0, nF = 0, nS = 0;
  for (const p of pairs) {
    const lowC = p.c < tauC;
    if (lowC && p.failed)  tp++;
    if (lowC && !p.failed) fp++;
    if (!lowC && !p.failed) tn++;
    if (!lowC && p.failed)  fn++;
    if (p.failed) { sumFailed += p.c; nF++; } else { sumSucceeded += p.c; nS++; }
  }

  const precision = (tp + fp) > 0 ? tp / (tp + fp) : null;
  const recall    = (tp + fn) > 0 ? tp / (tp + fn) : null;
  const f1        = (precision !== null && recall !== null && (precision + recall) > 0)
    ? 2 * precision * recall / (precision + recall)
    : null;
  const total     = pairs.length;
  const accuracy  = total > 0 ? (tp + tn) / total : null;
  const meanCFailed    = nF > 0 ? sumFailed / nF : null;
  const meanCSucceeded = nS > 0 ? sumSucceeded / nS : null;
  const deltaCClasses  = (meanCFailed !== null && meanCSucceeded !== null)
    ? meanCSucceeded - meanCFailed
    : null;

  return {
    n: total,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision, recall, f1, accuracy,
    meanCFailed, meanCSucceeded, deltaCClasses,
    sourceCounts: {
      tasks:  gtExport.tasks.length,
      labels: gtExport.labels.length,
      flags:  gtExport.flags.length,
    },
  };
}
