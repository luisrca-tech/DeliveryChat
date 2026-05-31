# AI Interview — Chat Mechanics

Covers the live mechanics of the interview chat page (`InterviewPage`) and the optimistic turn loop. As of Phase 3a, all stateful behaviour lives in the `useInterviewController(applicationId)` hook; the page itself is a thin view.

## Controller

`useInterviewController(applicationId)` is the sole owner of:

- Turn submission (bootstrap, send, retry).
- Finish-flow orchestration: `/complete` → `/generate-summary`, plus standalone retry of summary generation.
- Optimistic cache updates and turn-conflict refetch.
- Resume detection (first non-zero `currentTurn` observed is remembered as the resume marker).
- Error-to-surface mapping via `interviewErrorMapper`.

The exposed state is narrow:

```ts
{
  phase: "loading" | "load_error" | "intro" | "active" | "finishing"
       | "summarizing" | "finished" | "summary_pending_retry"
       | "error_send" | "error_complete" | "error_summary",
  turnLog: InterviewLogEntry[],
  progress: { currentTurn, maxTurns, tone, atTurnCap, canFinish, showResumePill, resumedFromTurn },
  errorSurface: InterviewErrorSurface | null,
  showConflictNotice: boolean,
  isSendingTurn: boolean,
  isStartingInterview: boolean,
  summaryStatus: "none" | "pending" | "ready" | "failed",
  composer: { isSending, sendDidFail, onSubmit, acknowledgeFailure },
  callbacks: { startInterview, sendTurn, finishInterview, retrySend, retrySummary, dismissConflictNotice }
}
```

`canFinish` is derived directly from the most recent server turn/bootstrap response. There is no mirrored local state on the page.

## Layout

- Header: progress chip (`InterviewProgressChip`, fed by `progress.displayTurn` so the first question reads "Turn 1 of 15" and the cap reads "Turn 15 of 15"), finish CTA when `progress.canFinish` or `progress.atTurnCap`.
- Scrollback (`InterviewChatScrollback`): assistant + user bubbles, thinking indicator while `isSendingTurn`.
- Inline surfaces (driven by `errorSurface.kind`): retry row, system bubble, missing-topics, blocking cap banner.
- Composer (`InterviewComposer`): textarea + submit, fed by `composer.*`. Disabled when at hard cap (turn 15).

## Turn loop (optimistic)

1. User submits via composer → `composer.onSubmit(message)`.
2. The controller dispatches `sendTurn` which:
   - Cancels stale queries, snapshots the previous cache, pushes an optimistic user bubble.
   - Calls `POST /turns` with the cached `expectedCurrentTurn`.
3. On success: the cache is replaced with the server's authoritative log slice; the assistant bubble appears.
4. On error (mapped via `interviewErrorMapper`):
   - Transient (`ai_timeout` / `ai_provider_busy` / `ai_provider_unavailable`) → `error_send` phase, retry row visible, last failed message preserved for `retrySend`.
   - Turn conflict → silent GET refetch; the conflict notice surfaces until the next successful send.
   - `ai_empty_response` / `ai_content_filtered` → inline system bubble (no retry row).
   - Monthly cap (`ai_monthly_cap_exceeded`) → blocking banner.
   - Other → toast fallback (mapper output `kind: "toast_fallback"`).

## Resume

When the user reopens an in-progress interview, the query refetches `GET /applications/:id/ai-interview` and seeds the cache. The transcript and progress chip pick up wherever the server left off; there is no separate resume indicator (a plain reload mid-session was indistinguishable from a real resume, so the badge was removed).

## Finish flow

Operator presses "Finish interview" → controller chains `POST /complete` → `POST /generate-summary`. The page enters `finishing` then `summarizing` phases (both render the generating state).

On success → `finished` phase, which redirects to the AI context view.

On `/complete` failure:
- `interview_checklist_incomplete` → `error_complete` phase, missing-topics surface.
- Other mapped errors → toast fallback.

On `/generate-summary` failure → `error_summary` phase rendering the full-page retry CTA, which calls `retrySummary` (only `/generate-summary`, never re-running `/complete`).

## Summary lifecycle and `summaryStatus`

The Phase 2a backend exposes `summaryStatus` on the GET response. The controller treats it as the source of truth for partial-finish recovery:

- `none` — interview is in progress (or not started).
- `pending` — `/complete` succeeded, summary not yet generated. The next turn into the page enters the finish flow automatically when retried.
- `ready` — happy path, summary available; phase resolves to `finished`.
- `failed` — `/complete` succeeded but `/generate-summary` failed in a prior session. The controller surfaces `summary_pending_retry` as a normal phase (not an error), rendering a dedicated CTA that calls `retrySummary`.

This lets the operator recover from a partial finish without losing their interview answers, regardless of which session triggered the failure.
