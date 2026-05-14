# useWebSocketHeartbeat

## Responsibility

Sends a `ping` frame every 30 seconds while the WebSocket is open to keep the connection alive through proxies and load balancers.

## Owned state

None (React state). Owns one ref:

- `pingRef` — the active `setInterval` handle.

## Exposed API

```ts
function useWebSocketHeartbeat(): {
  startHeartbeat(wsRef: RefObject<WebSocket | null>): void;
  stopHeartbeat(): void;
}
```

- `startHeartbeat(wsRef)` — clears any existing interval, starts a new 30-second interval that reads `wsRef.current` on each tick. If the socket is not `OPEN`, the tick is skipped.
- `stopHeartbeat()` — clears the interval without sending a ping.

## Invariants

- Calling `startHeartbeat` twice replaces the previous interval; no double-ping.
- No ping is ever sent if `wsRef.current?.readyState !== WebSocket.OPEN`.

## Test strategy

- Uses `vi.useFakeTimers()` to advance time by multiples of 30 s.
- Verifies ping count matches timer advances.
- Verifies no ping is sent after `stopHeartbeat`.
- Verifies no ping if `readyState` is `CLOSED`.
- Verifies restart replaces the previous interval (old socket receives no pings).
