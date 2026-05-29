# Interview Checklist & Explicit Completion (Phase 3)

## Overview

Phase 3 teaches the AI Interview engine when the interview is "done" and exposes an explicit transition route. It adds:

- A server-side **core-topic checklist** computed from the interview log.
- A `canFinish` flag in the `POST /turns` response.
- A `suggest_finish` downgrade-and-reprompt safeguard.
- A new `POST /applications/:applicationId/ai-interview/complete` route.

## Core topics

`CORE_TOPICS` in `ai.interviewer.ts`:

- `business_description`
- `target_audience`
- `products_services`
- `preferred_tone`
- `common_support_scenarios`
- `prohibited_topics`

## Coverage computation

Assistant log entries now persist `topicsCoveredThisTurn` (the keys the LLM reported for that turn). `computeCoveredTopics(interviewLog)` returns the union across all assistant entries:

- Unknown topic keys are logged and ignored — they never reject the LLM response.
- Coverage is recomputed on every turn; no extra column on `applicationAiContext`.

## `suggest_finish` handling

When the LLM returns `intent='suggest_finish'`:

1. The server projects the post-turn coverage set (including this turn's reported topics).
2. If every `CORE_TOPICS` entry is covered → response includes `canFinish: true` and the original `suggest_finish` intent is preserved.
3. If any topic is missing → the LLM is re-prompted with an explicit list of the missing topics and instructed to ask about one of them. The retry's output replaces the original; the persisted `intent` is `'ask'`; `canFinish` is `false`.

Both LLM calls in the re-prompt path are accounted for in `aiUsageLog` (token counts summed, last `finishReason` reported).

## `POST /complete`

Route: `POST /applications/:applicationId/ai-interview/complete`

Middleware chain: `requireTenantAuth → requireRole('admin') → checkBillingStatus → requireAiFeature('interview')`.

Body: `{ expectedCurrentTurn: number }`.

Behavior:

- `404` — application not owned by the tenant.
- `409 { error: 'turn_conflict', currentTurn, status }` — optimistic-lock mismatch or row already completed.
- `422 { error: 'interview_checklist_incomplete', missing: string[] }` — checklist not yet satisfied; `missing` lists uncovered core topics.
- `200 { status: 'completed', currentTurn, completedBy, completedAt }` — success.

On success, the row is updated with `status='completed'`, `completedBy=<user>`, `completedAt=<now>` inside a single transaction. `contextSummary` is **explicitly** left `null` and `applications.aiEnabled` stays `false` — both are Phase 4's responsibility.

## Concurrency

The same optimistic-lock semantics as `/turns` apply: `expectedCurrentTurn` is validated inside the transaction, and a stale value returns 409 without mutating the row.
