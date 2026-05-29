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

## Related docs

- Backend interview engine: `apps/hono-api/src/features/ai/docs/interview-engine.md`
- Interview checklist & completion: `apps/hono-api/src/features/ai/docs/interview-checklist-and-completion.md`
- Summary generation: `apps/hono-api/src/features/ai/docs/interview-summary.md`
- Prompt architecture: `apps/hono-api/src/features/ai/docs/prompt-architecture.md`
- Frontend chat mechanics: `apps/admin/src/features/aiInterview/docs/chat-mechanics.md`
- Frontend context view: `apps/admin/src/features/aiInterview/docs/context-view.md`
- Frontend error mapping: `apps/admin/src/features/aiInterview/docs/error-mapping.md`

## Deferred work

- [Redo AI Interview](./todo/redo-ai-interview.md) — allow re-running the interview from scratch on a completed application.
- [Edit summary directly](./todo/edit-summary-directly.md) — manual edits to the generated summary without regenerating.
