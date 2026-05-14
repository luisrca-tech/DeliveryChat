# Phase 5: Edit, Delete & Unread Counts

## Business rules

- Edit and delete controls are only shown on messages sent by the current visitor within the last **15 minutes** of `createdAt`. The API independently enforces this window; the UI enforces it client-side as a convenience.
- Editing opens an inline input pre-filled with the message content. Submitting calls `PATCH /conversations/:id/messages/:messageId`. Pressing Escape cancels without saving.
- Deleting immediately removes the message from local state after a successful `DELETE` call.
- `message:edited` and `message:deleted` WebSocket events apply the same mutations so changes from other sessions (e.g., admin-side deletions) reflect in real-time.

## Unread count badge

- `unreadCounts` is a `Record<conversationId, number>` in component state, initialised to zero.
- When a `message:new` WebSocket event arrives for a conversation that is **not currently selected**, `GET /conversations/:id/unread` is fetched and the badge is updated.
- When a `message:new` arrives for the **selected** conversation, `POST /conversations/:id/read` is called immediately (the user is already watching).
- Selecting a conversation clears its badge optimistically in state (before the response) and calls `POST /read` with the last message id after messages load.

## 15-minute window re-evaluation

A `setInterval` fires every 30 seconds and increments a discarded tick state, triggering a re-render that recomputes `withinEditWindow(msg.createdAt)` for every message. This ensures controls disappear automatically without a user action.
