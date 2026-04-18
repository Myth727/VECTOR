# VECTOR — Eval Suite
© 2026 Hudson & Perry Research

Formal pass/fail criteria for every release. Run all 15 evals before uploading any version.
Target: 15/15 before any commit. No eval failures ship.

---

## How to Run

Each eval is a manual check against the file or the running artifact. Mark PASS or FAIL.

---

## EVAL-01 — Parse Check
**Tests:** JSX compiles without syntax errors.
**How:** Paste `VECTOR.jsx` into Claude. Does it render without a parse error?
**Pass:** Artifact loads and shows the chat interface.
**Fail:** "Error running artifact" on load before any interaction.

---

## EVAL-02 — TuneModal Opens
**Tests:** TUNE button opens modal without runtime error.
**How:** Load artifact, click TUNE.
**Pass:** Modal opens showing PRESETS tab.
**Fail:** Any error toast, blank modal, or "X is not defined."

---

## EVAL-03 — DISPLAY Tab Renders
**Tests:** DISPLAY tab loads all controls.
**How:** Open TUNE → click DISPLAY tab.
**Pass:** Theme selector, font size slider, compact mode checkbox, domain anchor dropdown, and AutoTune toggle all visible.
**Fail:** Runtime error, blank tab, or any control missing.

---

## EVAL-04 — Compressed Pipe Format
**Tests:** Pipe injection is compact, not verbose.
**How:** Search `VECTOR.jsx` for `buildPipeInjection`. Return statement must start with `"[V|t"`.
**Pass:** `return"[V|t"+turn` present. No `[SYSTEM_INTERNAL` string in the function.
**Fail:** Old verbose format still present.

---

## EVAL-05 — AutoTune Wired
**Tests:** AutoTune computes and passes params to API call.
**How:** Search for `computeAutoTuneParams` inside `sendMessage` function, before `fetch(API_ENDPOINT`. Also check `atParams.temperature` passed to fetch body.
**Pass:** Both present in correct order.
**Fail:** Either missing, or only in engine module definitions.

---

## EVAL-06 — Feedback State Persists
**Tests:** Feedback loop saves and loads from localStorage.
**How:** Search for `saveFeedbackState` and `loadFeedbackState` as function definitions referencing `vector_fb` key.
**Pass:** Both functions present with correct key.
**Fail:** Either function missing.

---

## EVAL-07 — Reflexive Analysis Button
**Tests:** ANALYZE SESSION button exists and is guarded.
**How:** Search for `ANALYZE SESSION`. Must be inside a condition checking `coherenceData.length>=3`.
**Pass:** Both string and guard present.
**Fail:** String missing or no length guard.

---

## EVAL-08 — Knowledge Anchors Defined
**Tests:** All six domain anchors have terms.
**How:** Search `KNOWLEDGE_ANCHORS` constant. Check `medical`, `legal`, `engineering`, `finance`, `research` all have non-empty `terms` arrays.
**Pass:** All five domains present with terms.
**Fail:** Any domain missing or empty.

---

## EVAL-09 — displayPrefs Local to TuneModal
**Tests:** `displayPrefs` lives inside TuneModal, not threaded through context.
**How:** Find `export default function`. Search from there for `const [displayPrefs` — must NOT appear. Then find TuneModal and confirm `React.useState(()=>loadDisplayPrefs())` is present inside it.
**Pass:** No `[displayPrefs` in main component. Local state in TuneModal.
**Fail:** Either reversed.

---

## EVAL-10 — Pinned Docs Engine Defined
**Tests:** Persistent document slot functions exist.
**How:** Search for `MAX_PINNED_SLOTS`, `buildPinnedDocsInjection`, `readFileForPin`, `loadPinnedDocs`, `savePinnedDocs`.
**Pass:** All five present as definitions.
**Fail:** Any missing.

---

## EVAL-11 — Pinned Docs in System Prompt
**Tests:** Pinned docs inject before harness content.
**How:** Find `const systemPrompt=`. Must include `pinnedInj` and it must appear before `HARNESS_INJECTIONS`.
**Pass:** `BASE_SYSTEM+pinnedInj+HARNESS_INJECTIONS` order confirmed.
**Fail:** `pinnedInj` missing or after harness.

---

## EVAL-12 — Pinned Docs UI Renders
**Tests:** PINNED strip is visible above input bar.
**How:** Load artifact, look for `PINNED` label and `+ SLOT 1` button above the message input.
**Pass:** Strip visible with empty slot buttons.
**Fail:** Strip missing or input row shows nothing above it.

---

## EVAL-13 — Version Strings Consistent
**Tests:** Canonical VECTOR_VERSION is defined, rendered in the header, and matches package.json.
**How:**
1. Search `VECTOR.jsx` for `const VECTOR_VERSION = "V`. Must be present.
2. Search for `{VECTOR_VERSION}` inside the JSX header render (subtitle area).
3. Compare the string value in `VECTOR_VERSION` against `version` field in `package.json` (drop the `V` prefix — e.g. `V1.8.0` in jsx matches `"1.8.0"` in package.json).
**Pass:** Constant defined, rendered in UI, matches package.json.
**Fail:** Any of the three missing or mismatched.

---

## EVAL-14 — Pipe Key in BASE_SYSTEM
**Tests:** Model can decode compressed pipe format.
**How:** Search for `PIPE KEY: t=turn` inside `BASE_SYSTEM` constant.
**Pass:** String present in BASE_SYSTEM.
**Fail:** Missing — model cannot read compressed pipe.

---

## EVAL-15 — pinnedDocs State in Main Component
**Tests:** `pinnedDocs` state is declared in the main component and saves correctly.
**How:** Find `export default function`. Search for `const [pinnedDocs` — must be present. Also check `savePinnedDocs(nd)` called in both the upload handler and the remove handler.
**Pass:** State declared, both save calls present.
**Fail:** State missing or save not wired.

---

## Release Checklist

- [ ] EVAL-01 Parse Check
- [ ] EVAL-02 TuneModal Opens
- [ ] EVAL-03 DISPLAY Tab Renders
- [ ] EVAL-04 Compressed Pipe Format
- [ ] EVAL-05 AutoTune Wired
- [ ] EVAL-06 Feedback State Persists
- [ ] EVAL-07 Reflexive Analysis Button
- [ ] EVAL-08 Knowledge Anchors Defined
- [ ] EVAL-09 displayPrefs Local to TuneModal
- [ ] EVAL-10 Pinned Docs Engine Defined
- [ ] EVAL-11 Pinned Docs in System Prompt
- [ ] EVAL-12 Pinned Docs UI Renders
- [ ] EVAL-13 Version Strings Consistent
- [ ] EVAL-14 Pipe Key in BASE_SYSTEM
- [ ] EVAL-15 pinnedDocs State in Main Component

**15/15 required to ship.**

---

## Where This File Lives

This file lives at `evals/VECTOR_EVALS.md` in the repo.

---

*Based on eval-driven development (EDD). Evals are first-class release artifacts.*
*© 2026 Hudson & Perry Research*
