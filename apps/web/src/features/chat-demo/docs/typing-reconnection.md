# Phase 6: Typing Indicators & Reconnection

## Typing Indicators

### Visitor → Operator
When the visitor types in the message input:
1. `typing:start` is sent to the server the first time the input changes after idle.
2. A 1.5 s debounce timer resets on every keystroke.
3. When the timer fires (inactivity), `typing:stop` is sent.
4. On message send, `typing:stop` is sent immediately and the debounce is cancelled.

The `isSendingTypingRef` flag prevents duplicate `typing:start` frames while the user is actively typing.

### Operator → Visitor
Incoming `typing:start` / `typing:stop` events from the server set the `operatorTyping` boolean. The UI renders a small "Operator is typing…" line above the message input. The flag is also cleared on `message:new` (when the operator sends a message, the typing indicator disappears instantly).

## Exponential Backoff Reconnection

The WebSocket connection is managed inside a single `useEffect` keyed on `selectedId`. On each selection change all pending state (connection, timers, retry counters) is reset.

The `connect()` async function:
1. Fetches a fresh JWT via `POST /v1/api/ws-token`.
2. Opens the WebSocket.
3. Reads `lastMessageId` from `localStorage` (key: `dc_last_msg_<conversationId>`) and includes it in `room:join`.
4. Resets `reconnectAttemptRef` to 0 on success.

On WebSocket `close`, `scheduleReconnect()` is called:
- Delay = `min(1000 × 2^attempt, 30_000)` ms.
- Attempt counter increments before scheduling.
- Capped at 30 s.

The `cancelled` flag prevents reconnection after the effect is torn down (conversation deselected or component unmounted).

## `lastMessageId` Tracking

`localStorage` key: `dc_last_msg_<conversationId>`

Updated when:
- Messages are loaded from REST on conversation open (`getMessages`).
- `message:ack` is received (optimistic message confirmed).
- `message:new` is received while the conversation is open.
- `messages:sync` is received on reconnect (last message in the synced batch).

On reconnect, the stored ID is sent in `room:join`. The server responds with a `messages:sync` event containing any missed messages, which are merged (deduped by ID) into the message list.
