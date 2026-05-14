# useWebSocketDispatch

## Responsibility

Wraps `wsMessageReducer` and routes each incoming WebSocket message to the correct React state setter or side-effect handler. Owns the `stateRef` stale-closure guard so `handleWsMessage` stays stable across renders.

## Owned state

None (React state). Owns one ref:

- `stateRef` — mirrors the current `{ messages, conversations, operatorTypingName }` slice so the stable callback always reads the latest state without triggering re-renders.

## Exposed API

```ts
type WsDispatchOptions = {
  wsRef: RefObject<WebSocket | null>;
  conversationClosedRef: MutableRefObject<boolean>;
  selectedIdRef: RefObject<string | null>;
  messages: OptimisticMessage[];
  conversations: Conversation[];
  operatorTypingName: string | null;
  setMessages: (msgs: OptimisticMessage[]) => void;
  setConversations: (convs: Conversation[]) => void;
  setOperatorTypingName: (name: string | null) => void;
  setLastMessageId: (conversationId: string, messageId: string) => void;
  onMarkAsRead: (conversationId: string, messageId: string) => void;
  refreshUnread: (conversationId: string) => Promise<void>;
};

function useWebSocketDispatch(opts: WsDispatchOptions): {
  handleWsMessage: (event: MessageEvent) => void;
}
```

- `handleWsMessage` is a stable function (same identity across renders). Register it as a WebSocket `message` listener or pass it via a ref.

## Side-effect contract

After `wsMessageReducer` returns:

| Effect | Action |
|---|---|
| `close-socket` | `wsRef.current?.close()`, set to `null`, set `conversationClosedRef.current = true` |
| `persist-last-message` | calls `setLastMessageId` |
| `mark-as-read` | calls `onMarkAsRead` |
| `refresh-unread` | calls `refreshUnread` (async, non-fatal) |

## Test strategy

- Uses `renderHook` with mocked setters and refs.
- Dispatches raw `MessageEvent` objects and verifies the correct setter is called with the correct value.
- Verifies socket is closed and `conversationClosedRef` is set on `conversation:resolved`.
- Verifies malformed JSON is silently ignored.
