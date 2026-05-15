# useWebSocketConnection

## Responsibility

Manages the full WebSocket lifecycle for the currently selected conversation: token fetch, socket construction, `room:join`, heartbeat, reconnect scheduling, and cleanup on conversation change or unmount.

## Owned state

- `wsStatus: WsStatus` — `"connecting" | "connected" | "disconnected"`.

Owns these refs:

- `wsRef` — the active WebSocket instance (or `null`).
- `reconnectAttemptRef` — incremented by `useWebSocketReconnect` on each attempt; reset to 0 on successful connection.
- `conversationClosedRef` — set to `true` by `useWebSocketDispatch` when the server resolves the conversation; prevents reconnect after a deliberate close.
- `selectedIdRef` — stale-closure guard: always reflects the current `selectedId` so the async `connect()` closure can detect that the conversation switched mid-flight and abort safely.

## Exposed API

```ts
type UseWebSocketConnectionOptions = {
  selectedId: string | null;
  client: ChatClient;
  getLastMessageId: (conversationId: string) => string | null | undefined;
  onMessageRef: MutableRefObject<(e: MessageEvent) => void>;
  onResetTyping: () => void;
};

function useWebSocketConnection(opts: UseWebSocketConnectionOptions): {
  wsRef: RefObject<WebSocket | null>;
  wsStatus: WsStatus;
  conversationClosedRef: MutableRefObject<boolean>;
  selectedIdRef: MutableRefObject<string | null>;
};
```

- `onMessageRef` — a ref (not a callback) so that `ChatDemoIsland` can populate `handleWsMessage` from `useWebSocketDispatch` after calling this hook, breaking the circular dependency.
- `onResetTyping` — called at the start of each effect run to clear `operatorTypingName` when the conversation changes.

## Connection lifecycle

1. Effect runs when `selectedId` changes.
2. Previous socket/timers are torn down; refs are reset.
3. `connect()` fetches a WS token, opens the socket, sends `room:join` (with optional `lastMessageId`).
4. On success: resets `reconnectAttemptRef`, starts heartbeat, registers `message`, `close`, and `error` listeners.
5. On `close` (if not `cancelled` and not `conversationClosedRef`): schedules reconnect via `useWebSocketReconnect`.
6. Cleanup: sets `cancelled = true`, closes socket, stops heartbeat, cancels pending reconnect.

## Invariants

- `selectedIdRef` is updated synchronously at the top of every effect run before any async work, ensuring `connect()` closures always compare against the latest value.
- `conversationClosedRef.current = true` is set externally (by `useWebSocketDispatch`) when `conversation:resolved` is received, which suppresses reconnect in the `close` handler.

## Test strategy

- Uses a `MockWebSocket` class with `trigger(event)` to simulate server events.
- `makeMockClient(sockets)` fills an array with fresh socket instances per connect call, preventing listener accumulation across strict-mode double-invocations.
- Tests use `waitFor` (real timers) for async assertions; fake timers are only introduced in tests that explicitly need timer control.
