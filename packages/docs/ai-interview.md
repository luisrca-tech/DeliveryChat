# AI Interview (Admin)

The AI interview is how admins onboard an application's AI assistant. It is a guided conversation that captures business context, target audience, tone, and prohibited topics, then generates a markdown summary that grounds `Generate Reply` and `Improve` for that application.

## Where it lives

- **Applications page** (`/applications`) — top-level sidebar entry. The list shows an "AI" status column with three states: `Not started`, `In progress`, `Completed`.
- **Interview chat** (`/applications/:applicationId/ai-interview`) — guided chat where the AI asks structured questions and the admin answers.
- **Context view** (`/applications/:applicationId/ai-context`) — read view of the generated summary plus the transcript. Admins can regenerate the summary from the existing log.

## Lifecycle

```
not_started ──▶ in_progress ──▶ completed
                                    │
                                    └──▶ (regenerate summary; status unchanged)
```

- A brand-new application starts at `not_started`.
- Sending the first interview reply transitions to `in_progress`.
- Pressing **Finish** (then summary generation succeeds) transitions to `completed`.
- Regenerating the summary keeps the status at `completed` — only the summary text changes.

## `summaryStatus` lifecycle

The `summaryStatus` column on `applicationAiContext` makes "interview completed, summary not yet generated" a queryable database state. It is independent from `status` and tracks the summary-generation step.

```
none ──(complete) ──▶ pending ──(generate-summary success) ──▶ ready
                                 └──(generate-summary failure) ──▶ failed
                                                                    │
                            (retry generate-summary) ◀──────────────┘
```

| `summaryStatus` | When it appears                                                                 |
| --------------- | ------------------------------------------------------------------------------- |
| `none`          | Interview is still `in_progress` (or has never been started).                   |
| `pending`       | Interview just transitioned to `completed`; summary has not yet been generated. |
| `ready`         | Summary generation succeeded; `contextSummary` is populated.                    |
| `failed`        | Summary generation attempt failed; the row is eligible for retry.               |

Endpoint semantics:

- **`POST /applications/:id/ai-interview/complete`** is idempotent. Calling it on an already-completed row returns the existing row unchanged — it does not re-run the checklist and does not overwrite `summaryStatus`. The first successful completion sets `summaryStatus = 'pending'`.
- **`POST /applications/:id/ai-interview/generate-summary`** is retry-safe. It is accepted whenever `status === 'completed'`, regardless of the current `summaryStatus` (`pending` for the first attempt, `failed` for a recovery retry, or `ready` for a regeneration). Success sets `summaryStatus = 'ready'` and updates `contextSummary`. Failure sets `summaryStatus = 'failed'` and preserves the previous `contextSummary` if any.

Backfill rules applied by migration `0032`:

- `status = 'completed'` AND `contextSummary IS NOT NULL` → `ready`
- `status = 'completed'` AND `contextSummary IS NULL` → `pending`
- otherwise → `none`

The GET `/applications/:id/ai-interview` response returns `summaryStatus` on every branch (in-progress and completed). The applications-list `aiInterviewStatus` derived field still reflects only `status` and is unchanged.

## Authorization

All three routes are gated by `useRequireRole(["admin", "super_admin"])`. Operators are redirected to the home page.

## Post-creation onboarding

When an application is created from the Applications page, the dialog content swaps to an onboarding panel with two actions:

- **Configure AI now** → navigates to the interview chat for the new application.
- **Later** → closes the dialog. No success toast — the new row in the list is the confirmation.

The new row appears immediately with status `Not started` via an optimistic cache patch.

## Generate Reply / Improve gating

`useAiAvailability(applicationId)` returns unavailable when either the plan is not PREMIUM/ENTERPRISE or the application's `aiInterviewStatus` is not `completed`. The conversation composer disables `Generate Reply` and `Improve` and shows an inline hint:

> AI is not configured for this application yet. [Configure now →]

The "Configure now" link is shown to `admin` / `super_admin` viewers and routes to that application's interview page.

## Discovery phase (classify-then-act)

Once every core topic is covered and the interview is past the soft-finish-window minimum (turn 8), the interviewer enters a **Discovery phase**: every new admin message is treated as "extra context" and classified into one of three buckets that drives behaviour.

| `extraContextRelevance` | When the LLM picks it                                                                                        | Assistant behaviour                                                              | `followUpQuestion` |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------ |
| `relevant`              | Extra introduces material that would sharpen the support config (new prohibited topic, audience, tone, etc.) | Ask exactly one targeted follow-up question that materially sharpens the config. | `true`             |
| `irrelevant`            | Extra is about the business but does not shape end-user support (funding, runway, headcount, MRR, roadmap)   | Brief acknowledgement, no follow-up question.                                    | `false` / absent   |
| `duplicate`             | Extra substantially repeats prior log content, including paraphrased near-duplicates                         | Acknowledge as duplicate, no follow-up question.                                 | `false` / absent   |

Both `extraContextRelevance` and `followUpQuestion` are optional structured-output fields persisted on the assistant log entry. They are only set on Discovery turns; bootstrap and core-coverage turns leave them absent.

The Finish affordance is **always** driven by the `canFinish` API field (and the always-visible Finish button). The Discovery phase does not flip `canFinish` — the admin can finish whenever they want, and any number of Discovery turns simply enrich the eventual `contextSummary`.

The turn cap (`MAX_TURNS = 15`) and forced completion at the cap are unchanged: a Discovery run that reaches turn 15 transitions to `status='completed'` with the final assistant message preserved.

## Related docs

- Backend interview engine: `apps/hono-api/src/features/ai/docs/interview-engine.md`
- Interview checklist & completion: `apps/hono-api/src/features/ai/docs/interview-checklist-and-completion.md`
- Summary generation: `apps/hono-api/src/features/ai/docs/interview-summary.md`
- Prompt architecture: `apps/hono-api/src/features/ai/docs/prompt-architecture.md`
- Frontend chat mechanics: `apps/admin/src/features/aiInterview/docs/chat-mechanics.md`
- Frontend context view: `apps/admin/src/features/aiInterview/docs/context-view.md`
- Frontend error mapping: `apps/admin/src/features/aiInterview/docs/error-mapping.md`
- Frontend editorial design system: `apps/admin/src/features/aiInterview/docs/design.md`

## Deferred work

- [Redo AI Interview](./todo/redo-ai-interview.md) — allow re-running the interview from scratch on a completed application.
- [Edit summary directly](./todo/edit-summary-directly.md) — manual edits to the generated summary without regenerating.
