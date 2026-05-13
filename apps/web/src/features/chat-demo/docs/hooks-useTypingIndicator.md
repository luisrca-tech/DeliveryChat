# useTypingIndicator

## Responsibility

Sends `typing:start` and `typing:stop` WebSocket events to signal keystroke activity to operators. Debounces stop after 1.5 s of inactivity and sends it immediately on explicit send or conversation change.

## Owned state

None (React state). Owns two refs:

- `isSendingTypingRef: boolean` — tracks whether a `typing:start` has been sent without a matching `typing:stop`.
- `typingTimeoutRef` — the active debounce timer.

## Exposed API

```ts
function useTypingIndicator(
  wsRef: RefObject<WebSocket | null>,
  selectedId: string | null,
): {
  notifyTyping(): void;
  sendTypingStop(): void;
}
```

- `notifyTyping` — call on each input change. Sends `typing:start` once (idempotent), then resets the debounce timer.
- `sendTypingStop` — call on `handleSend()` and conversation change to immediately signal stop without waiting for the debounce.

## Invariants

- No WebSocket event is sent if the socket is closed or `selectedId` is null.
- After `sendTypingStop`, the next `notifyTyping` call will send `typing:start` again (state reset).

## Test strategy

- Uses `vi.useFakeTimers()` to advance the debounce without real waits.
- Uses a mock WebSocket `{ readyState: WebSocket.OPEN, send: vi.fn() }`.
- Verifies `typing:start` is sent exactly once per typing burst regardless of keystroke count.
- Verifies `typing:stop` fires at exactly 1500 ms via `vi.advanceTimersByTime`.
- Verifies `typing:stop` fires immediately on explicit `sendTypingStop()`.
