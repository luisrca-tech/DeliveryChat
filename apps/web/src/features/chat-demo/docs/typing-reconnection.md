# Typing Indicators & Reconnection

## Typing Indicators

### Visitor → Operator

When the visitor types in the message input:

1. `typing:start` is sent to the server the first time the input changes after idle.
2. A 1.5 s debounce timer resets on every keystroke.
3. When the timer fires (inactivity), `typing:stop` is sent.
4. On message send, `typing:stop` is sent immediately and the debounce is cancelled.

Owned by: **`useTypingIndicator`** (`hooks/useTypingIndicator.ts`).

### Operator → Visitor

Incoming `typing:start` / `typing:stop` events from the server are handled in **`useWebSocketDispatch`**, which calls `setOperatorTypingName`. The UI renders a small "is typing…" line above the message input. The flag is also cleared on `message:new` (operator sends → typing indicator disappears instantly) and when the selected conversation changes (`onResetTyping` callback in `useWebSocketConnection`).

---

## Exponential Backoff Reconnection

Reconnection is split across two hooks:

### `useWebSocketReconnect` (`hooks/useWebSocketReconnect.ts`)

Stateless scheduler. Returns `scheduleReconnect(attemptRef, connectFn)` and `cancelReconnect()`.

- Delay = `min(1000 × 2^attempt, 30_000)` ms.
- Increments `attemptRef.current` as a side effect.
- Capped at 30 s.

### `useWebSocketConnection` (`hooks/useWebSocketConnection.ts`)

Manages the full lifecycle. On WebSocket `close`:

1. Checks the `cancelled` flag (set if the conversation was deselected or the component unmounted).
2. Checks `conversationClosedRef.current` (set by `useWebSocketDispatch` on `conversation:resolved`).
3. If neither guard is active, calls `scheduleReconnect(reconnectAttemptRef, connect)`.

On successful reconnect, `reconnectAttemptRef` is reset to 0 and `room:join` is sent with the stored `lastMessageId` (from `useLocalMessageSync`), triggering a `messages:sync` response from the server.

---

## `lastMessageId` Tracking

`localStorage` key: `dc_last_msg_<conversationId>`

Managed by: **`useLocalMessageSync`** (`hooks/useLocalMessageSync.ts`).

Updated when:
- Messages are loaded from REST on conversation open (`getMessages`).
- `message:ack` is received (optimistic message confirmed) — via `useWebSocketDispatch` → `setLastMessageId`.
- `message:new` is received while the conversation is open — via `useWebSocketDispatch`.
- `messages:sync` is received on reconnect — via `wsMessageReducer` → `persist-last-message` effect.

On reconnect, `useWebSocketConnection` reads the stored ID via `getLastMessageId` and includes it in `room:join`. The server responds with a `messages:sync` event containing any missed messages.
