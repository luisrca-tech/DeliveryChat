# AI Interview — Chat Mechanics

Covers the live mechanics of the interview chat page (`InterviewPage`) and the optimistic turn loop.

## Layout

- Header: app name, progress chip (`InterviewProgressChip`), resume pill when continuing.
- Scrollback (`InterviewChatScrollback`): assistant + user bubbles, system bubble for guardrail messages, inline retry row for transient failures.
- Composer (`InterviewComposer`): textarea + submit, cap banner above when approaching turn limit.

## Turn loop (optimistic)

1. User types a reply, hits send.
2. `useSendInterviewTurnMutation` performs an optimistic push of the user bubble into local state with a "pending" flag.
3. On success: replace pending entry with the server-returned log slice and append the assistant bubble.
4. On error (mapped via `interviewErrorMapper`):
   - Transient → inline retry row with the same payload and `expectedCurrentTurn`.
   - Turn conflict → silent GET refetch; rebuild log from server, drop optimistic entry.
   - Cap reached → cap banner pinned at top.
   - Other → mapped UI surface (toast or full-page error) per the mapper output.

## Resume

When the user reopens an in-progress interview, `useInterviewState` rehydrates from `GET /applications/:id/ai-interview` and the resume pill summarises last interaction.

## Finish

Operator presses "Finish" → `POST /complete` → `POST /generate-summary` chained. The page enters a non-optimistic loading state during this chain; on success it navigates to the context view.
