# useMessageInput

## Responsibility

Owns the send flow: manages the text input value, sends a message via WebSocket with an optimistic append, and rolls back the optimistic message on failure.

## Owned state

- `value: string` — current input text.
- `sending: boolean` — true while a send is in-flight.
- `error: string | null` — user-visible error from the last failed send attempt.

## Exposed API

```ts
function useMessageInput(
  wsRef: RefObject<WebSocket | null>,
  selectedId: string | null,
  visitorUserId: string | null,
  onAppend: (msg: OptimisticMessage) => void,
  onRollback: (clientId: string) => void,
): {
  value: string;
  sending: boolean;
  error: string | null;
  handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void;
  handleSend(e?: React.FormEvent): Promise<void>;
};
```

- `onAppend` / `onRollback` — message list mutations owned by the caller.
- `handleSend` — guards on empty content and non-OPEN WebSocket; appends optimistic message before the WS send call; rolls back if `ws.send()` throws.
- The `message:ack` replacement (converting optimistic → confirmed) is handled by the WebSocket dispatcher via `wsMessageReducer`.

## Test strategy

- Mock `wsRef.current` with a plain object (`{ readyState, send: vi.fn() }`).
- Verify `onAppend` receives a pending optimistic message with the correct content.
- Verify `onRollback` is called with the same `clientId` when `ws.send` throws.
- Verify error is set when WebSocket is not open.
