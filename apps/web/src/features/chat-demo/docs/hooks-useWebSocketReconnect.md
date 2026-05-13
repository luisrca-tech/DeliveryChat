# useWebSocketReconnect

## Responsibility

Schedules exponential-backoff reconnect attempts. Stateless — owns only the pending-timer ref. All guards (cancelled flag, conversationClosedRef) live in the caller.

## Owned state

None (React state). Owns one ref:

- `timerRef` — the active `setTimeout` handle, cleared on `cancelReconnect`.

## Exposed API

```ts
function useWebSocketReconnect(): {
  scheduleReconnect(attemptRef: MutableRefObject<number>, connectFn: () => void): void;
  cancelReconnect(): void;
}
```

- `scheduleReconnect` — reads `attemptRef.current`, computes `min(1000 × 2^attempt, 30_000)` ms, increments the counter, and schedules `connectFn`.
- `cancelReconnect` — clears any pending timer without firing `connectFn`.

## Invariants

- Delay sequence: 1 s → 2 s → 4 s → 8 s → 16 s → 30 s (capped).
- `attemptRef.current` is incremented as a side effect of each `scheduleReconnect` call.
- Calling `cancelReconnect` before the timer fires guarantees `connectFn` is never invoked.

## Test strategy

- Uses `vi.useFakeTimers()` to advance time without real waits.
- Calls `scheduleReconnect` with a manually set `attemptRef.current` and verifies `connectFn` fires exactly at the expected delay.
- Verifies the full 6-step delay sequence.
- Verifies `cancelReconnect` prevents the pending call.
