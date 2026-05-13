# useEditWindowTicker

## Responsibility

Forces a component re-render every 30 seconds so that the 15-minute edit-window calculation (`Date.now() - createdAt`) stays current in the UI without any user interaction.

## Owned state

- `tick: number` — a monotonically incrementing counter. The value itself is irrelevant; only its change matters.

## Exposed API

```ts
function useEditWindowTicker(): number
```

Returns the current tick count. Callers ignore the value; returning it ensures React's reconciler sees a new reference and re-renders.

## Test strategy

- Uses `vi.useFakeTimers()` to advance time synchronously.
- `act(() => vi.advanceTimersByTime(30_000))` flushes React state updates before asserting.
- Verifies the interval is cleared on unmount to prevent memory leaks.
