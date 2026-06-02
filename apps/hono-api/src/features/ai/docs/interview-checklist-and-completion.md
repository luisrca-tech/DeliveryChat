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

Assistant log entries now persist `topicsCoveredThisTurn` (the keys the LLM reported for that turn). `computeCoveredTopics(interviewLog)` returns the union across assistant entries that already have at least one user reply **after** them in the log (a topic is not credited on the question turn alone).

- Unknown topic keys are logged and ignored — they never reject the LLM response.
- Coverage is recomputed on every turn; no extra column on `applicationAiContext`.
- The LLM must tag topics based on what the admin answered, not what it plans to ask next.

## `suggest_finish` handling

When the LLM returns `intent='suggest_finish'`:

1. Coverage is evaluated from the persisted log **plus the admin's latest user message** (the reply to the previous question). Topics on the `suggest_finish` turn itself are not used for the checklist.
2. The assistant message is always replaced with the canned closing line (`SUGGEST_FINISH_CLOSING_MESSAGE`). The engine never injects an extra checklist question after `suggest_finish`.
3. `canFinish: true` when every `CORE_TOPICS` entry is covered, **or** when the LLM returned `suggest_finish` (the admin may finish even if a tag was missed). The closing assistant entry is persisted with `intent: 'suggest_finish'`.
4. `POST /complete` accepts the interview when the last assistant entry has `intent: 'suggest_finish'`, even if the strict checklist still has gaps.

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


## Related

- Admin UX: [`packages/docs/ai-interview.md`](../../../../../../packages/docs/ai-interview.md)
