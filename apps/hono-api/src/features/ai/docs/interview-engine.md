# AI Interview Engine

Reference doc for the AI Interview backend. Covers engine internals, the structured-output contract, guard-rails, route shapes, the turn cap, and the concurrency model.

For phase-by-phase context, see also `interview-checklist-and-completion.md` (Phase 3) and the Phase 4/5 sections below.

## Module placement

After the Phase 2b state-machine merge, the interviewer is consolidated:

- `ai.interview.stateMachine.ts` — `InterviewStateMachine`: turn decision rules,
  persistence, and provider invocation via the orchestrator. Public surface is
  `getInterviewContext`, `runInterviewTurn`, `runInterviewComplete`,
  `runGenerateSummary`. Internal decision-kind types are not exported.
- `ai.interview.guardRails.ts` — `Record<GuardRailAction, GuardRailRules>` strategy table
- `ai.interview.schema.ts` — `interviewerOutputSchema`, `CORE_TOPICS`, `MAX_TURNS`, log-entry shapes
- `ai.prompts.interview.ts` — `INTERVIEWER_SYSTEM_PROMPT` and `INTERVIEW_MODEL`
- `ai.callOrchestrator.ts` — shared provider call + `aiUsageLog` write + error mapping (used by `generateReply`, `improveMessage`, and the state machine)
- `ai.summaryGenerator.ts` — summary prompt + provider call (delegated to from the state machine's `runGenerateSummary`)
- `ai.errors.ts` — `MissingTopicsError`, `TurnConflictError`, `SummaryGenerationFailedError`, AI-call error classes

The Hono route folder under `apps/hono-api/src/routes/applications/ai-interview/` is a thin adapter that dispatches to the state machine.

See [`interview-module-boundaries.md`](./interview-module-boundaries.md) for the data flow diagram and extension-point guidance.

## Structured-output contract

Every interview LLM call uses `provider.generateObject(...)` with `interviewerOutputSchema`:

```ts
{
  assistantMessage: string,                  // markdown allowed, sanitized server-side
  intent: 'ask' | 'suggest_finish' | 'final_question',
  topicsCoveredThisTurn: string[],           // CORE_TOPICS keys; unknown keys logged + ignored
  guardrailAction:
    'none' | 'redirect_scope' | 'block_extraction' |
    'pushback_garbage' | 'accept_garbage'
}
```

`MockProvider.queueObject(...)` drives this in tests; `GroqProvider.generateObject(...)` backs production.

## Routes

All routes mounted under the application resource. Middleware chain:

- `POST` routes: `requireTenantAuth → requireRole('admin') → checkBillingStatus → requireAiFeature('interview')`
- `GET` routes: `requireTenantAuth → requireRole('admin')` (read-only)

Cross-tenant `applicationId` always returns `404` (never `403`).

### `GET /applications/:applicationId/ai-interview`

Hydrate / resume:

- No row yet: `{ status: 'not_started' }`.
- Existing row: `{ status, currentTurn, interviewLog }`.

### `POST /applications/:applicationId/ai-interview/turns`

Body: `{ message?: string, expectedCurrentTurn: number }`.

Two execution paths, picked from the body:

- **Bootstrap** — `expectedCurrentTurn === 0` and `message` empty/absent. Lazily creates the `applicationAiContext` row, invokes the LLM for the opening question, persists the assistant entry, logs to `aiUsageLog`.
- **Advance** — otherwise. Appends the user message, calls the LLM, persists both messages, and increments `currentTurn`.

Response shape:

```ts
{
  status,
  currentTurn,
  interviewLog,
  canFinish,
  turn: { intent, topicsCoveredThisTurn, guardrailAction }
}
```

### `POST /applications/:applicationId/ai-interview/complete`

Body: `{ expectedCurrentTurn: number }`. Explicit transition to `status='completed'`. Returns `422 interview_checklist_incomplete` when core topics are missing, `409 turn_conflict` on stale state, or `200` on success.

Phase 5 explicitly leaves `contextSummary = null` and `applications.aiEnabled = false`; flipping those is a later phase.

## Turn semantics

- One turn = one Q&A pair.
- Bootstrap question is turn 0 and is free.
- Hard cap: `MAX_TURNS = 15`. The `applicationAiContext.currentTurn` column has a DB-level `CHECK (currentTurn 0–15)` constraint.

## Core-topic checklist

`CORE_TOPICS` (server-side constant):

- `business_description`
- `target_audience`
- `products_services`
- `preferred_tone`
- `common_support_scenarios`
- `prohibited_topics`

`computeCoveredTopics(log)` returns the union of `topicsCoveredThisTurn` across every assistant entry. Unknown keys are logged and ignored, never rejected. No extra column — coverage is derived on every call.

When the LLM returns `intent='suggest_finish'` but the checklist is incomplete, the server silently downgrades to `intent='ask'` and re-prompts the LLM with the missing topics. Both LLM calls in the re-prompt path are accounted for in `aiUsageLog`.

## Guard-rail actions

Local to the interview engine; do not touch the universal `baseGuardRails`.

- `none` — normal turn. Advances `currentTurn`.
- `redirect_scope` — admin tried to chat off-topic. Appends the assistant's redirect but does **not** advance `currentTurn`, so guard-rail no-ops can't be used to skip core topics. Repeated attempts stay pinned.
- `block_extraction` — admin tried to extract instructions/system prompt. Refuse briefly. Does **not** advance `currentTurn`.
- `pushback_garbage` — admin's answer is empty/incoherent. Advances `currentTurn` and persists `garbagePushbackTopics: string[]` on the user log entry indicating which topic was just pushed back on. Next turn's LLM input surfaces this marker via a system note.
- `accept_garbage` — used when the prior turn had a push-back marker and the next attempt is still imperfect. Advances `currentTurn` so the admin is never blocked.

## Turn cap & forced conclusion (Phase 5)

The engine paces the LLM and force-terminates at the hard cap.

### Pacing hint

Every advance turn injects a system message with the turn budget:

```
Turn budget: this will be question N of 15. Remaining after this one: K.
```

This is appended in `buildAdvanceMessages(...)` so the LLM can budget follow-ups.

### Final-question framing

When the advance turn is the cap-hitting one (`row.currentTurn + 1 === MAX_TURNS`):

- The system prompt gets an additional instruction telling the LLM to set `intent='final_question'` and frame the message as the last one.
- After the LLM returns, the server **overrides** the intent to `'final_question'` (unless the response was a no-advance guard-rail like `redirect_scope` / `block_extraction`).
- The persisted assistant log entry is flagged with `intent: 'final_question'`, making the row state self-describing.

### Forced completion

When the admin POSTs an answer while `row.currentTurn === MAX_TURNS`:

- The LLM is **not** called.
- The user message is appended to the log.
- The row transitions to `status='completed'`, with `completedBy` set to the calling user and `completedAt` set to now.
- The checklist is **bypassed** — the admin is never blocked from completing once they've answered the final question.
- A row is written to `aiUsageLog` with `finishReason='forced_cap_completion'` so operators can distinguish clean completions from forced ones.
- A `console.warn` is emitted with `{ applicationId, userId, currentTurn }` for observability.

The route surfaces the resulting `status='completed'` to the admin via the standard advance response shape.

## Concurrency model

Optimistic locking on `currentTurn`. Every mutating call carries `expectedCurrentTurn`; mismatch (including `status='completed'`) returns `409 { error: 'turn_conflict', currentTurn, status }`. The check happens inside the same Drizzle `db.transaction(...)` as the mutation, so two racing clients can never both advance.

A `409` with `status='completed'` is a benign terminal state for the caller — the frontend can treat it as success.

## Persistence model

Each `POST /turns` and each `POST /complete` runs inside a single `db.transaction(...)`. LLM failures abort the transaction cleanly: no partial user message left in the log, `currentTurn` unchanged, error envelope surfaced from `ai.errorMapper.ts`. Retrying the same `POST` with the same `expectedCurrentTurn` is safe.

The forced-completion path on turn 15 runs inside the same transaction shape and writes both the row update and the usage-log marker atomically.

## Usage logging

Every interview LLM call writes to `aiUsageLog` with `action='interview'`. This action is in `QUOTA_EXCLUDED_ACTIONS`, so it is observable but not counted against the monthly quota. Distinct `finishReason` values:

- `stop` / provider-native reasons — normal turn.
- `forced_cap_completion` — Phase 5 forced completion at the hard cap.


## Related

- Admin UX: [`packages/docs/ai-interview.md`](../../../../../../packages/docs/ai-interview.md)
