# Interview Summary Generation & AI Activation

This document covers the two-step interview completion flow introduced in Phase 4
of the AI Interview feature: the dedicated summary generator module, the
`complete` and `generateSummary` actions, and the `aiEnabled` lifecycle.

Related docs:

- [interview-engine.md](./interview-engine.md) — turn engine, guard-rails, and forced completion.
- [interview-checklist-and-completion.md](./interview-checklist-and-completion.md) — core-topic checklist semantics.
- [interview-module-boundaries.md](./interview-module-boundaries.md) — module ownership rules.
- [ai-usage.md](./ai-usage.md) — `aiUsageLog` schema and quota accounting.

## Two-step UX

Finishing the interview is split into two explicit actions so admins can review
the captured log before paying for an LLM-generated summary, and so a failed
summary regeneration never destroys a previously good one.

1. **`complete`** — deterministic, no LLM call. Transitions the
   `applicationAiContext` row from `status: 'in_progress'` to
   `status: 'completed'`, sets `completedBy` and `completedAt`. Leaves
   `applications.aiEnabled = false`. Both the normal admin Finish path and the
   forced turn-15 cap converge on this exact state.
2. **`generateSummary`** — LLM call. Reads the persisted interview log, invokes
   the summary generator, persists `contextSummary`, and flips
   `applications.aiEnabled = true`. Re-runnable while
   `status === 'completed'`.

After `complete` and before `generateSummary`, the application is finished but
the support AI assistant remains disabled.

## Forced-path convergence

`runForcedCompletion` (the turn-15 cap path) lands on the same persisted state
as the normal `complete` action: `status: 'completed'`,
`completedBy`/`completedAt` populated, `aiEnabled` untouched at `false`. No
inline summary attempt is made — the admin still has to invoke
`generateSummary` explicitly.

## Summary generator module

Lives at `apps/hono-api/src/features/ai/ai.summaryGenerator.ts`. Deliberately
isolated from the turn engine: it owns its system prompt, its output
validation, and its own entry point. The interview turn engine never imports
it.

### I/O contract

- **Input**: the persisted `interviewLog` plus the application's display name.
- **Output**: a sanitized markdown string covering the six core topics
  (Business, Audience, Products & Services, Tone, Common Scenarios, Prohibited
  Topics) plus a synthesis "Drafting Guidance" section with 2–4 imperative
  do/don't bullets.
- **Model**: same `AI_INTERVIEW_MODEL` used by turn calls. No new env var.

### Validation

The module rejects:

- empty strings (no output);
- output exceeding ~8000 characters;

and always runs the existing AI sanitizer before returning. Failures throw a
typed `summary_generation_failed` error.

## Atomicity & regeneration semantics

- The `aiEnabled` flip is owned by the **service layer**, not the
  `InterviewRepository`. `InterviewRepository` continues to manage a single
  table; the cross-table mutation lives in `ai.interview.service.ts`.
- On success, `contextSummary` is overwritten and `aiEnabled` is set to
  `true` (no-op on subsequent successes).
- On failure (generator validation error or provider error), **no mutation
  occurs**. A failed regeneration leaves the prior `contextSummary` and
  `aiEnabled` intact. The endpoint surfaces a typed
  `summary_generation_failed` error.

## `aiUsageLog` semantics

Every `generateSummary` invocation produces exactly one `aiUsageLog` row,
written through the shared `runAiCall` runner so the pattern matches turn
calls.

- `action: 'interview_summary'` — added to `aiActionEnum` in Phase 1.
- `status: 'success'` on success, with populated `promptTokens`,
  `completionTokens`, `latencyMs`, `model`, and `finishReason`.
- `status: 'failed'` on provider errors and on validation failures
  (empty / oversize output), with a meaningful `finishReason`.
- **Excluded from `checkAiQuota`** via `QUOTA_EXCLUDED_ACTIONS` — summary
  generation never counts against the monthly cap.
- Multiple regenerations produce multiple rows; the quota counter is
  unaffected.

## Soft-finish nudge (Phase 5)

The interview engine recognizes the natural completion window:

- The interviewer system prompt states the 8–12 finish-window policy.
- `buildAdvanceMessages` injects a conditional system message when
  **both** gating conditions hold for the upcoming turn: next-turn ∈ [8, 12]
  **and** all six core topics are already covered. The nudge tells the LLM
  that setting `intent: 'suggest_finish'` is acceptable.
- Outside the window, or with topics still missing, the nudge is omitted and
  the existing missing-topics reprompt logic continues to govern premature
  finish suggestions.
