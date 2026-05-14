# Conversation List & New Conversation (Phase 3)

## What this builds

The `ChatDemoIsland` renders a two-panel layout inside the `aspect-video` container:

- **Left panel (240 px)**: lists all visitor conversations fetched via `GET /v1/api/conversations` on mount. Each item shows the subject (or "No subject" fallback) and a status badge. A `+` button opens an inline form for creating a new conversation.
- **Right panel (flex-1)**: shows the message history for the selected conversation, fetched via `GET /v1/api/conversations/:id/messages`. Visitor messages align right (primary bg), operator messages align left (muted bg).

## Visitor vs operator message alignment

Messages are aligned based on `senderId`. On mount the island inspects the `participants` array of every loaded conversation and caches the userId of the first participant with `role === "visitor"`. Any message whose `senderId` matches that userId is treated as a visitor message.

When a new conversation is created via the form, the response includes `participants`, which is used to hydrate `visitorUserId` if it hasn't been set yet.

## Data flow

1. Mount → `GET /conversations` → populate list, derive `visitorUserId`
2. Select conversation → `GET /conversations/:id/messages` → render messages
3. Submit new-conversation form → `POST /conversations` → prepend to list, auto-select, clear form
4. All network I/O goes through `chat-client.ts` — no component imports `fetch` directly

## Phase boundaries

- **Phase 3**: REST-only. No WebSocket, no message sending input.
- **Phase 4**: Adds the message input bar, optimistic sends, and WebSocket real-time events.
