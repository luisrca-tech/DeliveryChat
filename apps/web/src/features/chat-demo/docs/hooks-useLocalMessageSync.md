# useLocalMessageSync

## Responsibility

Encapsulates `localStorage` read/write for the per-conversation "last seen message" tracking. Provides a stable key-namespacing contract (`dc_last_msg_<conversationId>`) so callers never construct storage keys directly.

## Owned state

None — all state lives in `localStorage`.

## Exposed API

```ts
function useLocalMessageSync(): {
  getLastMessageId(conversationId: string): string | undefined;
  setLastMessageId(conversationId: string, messageId: string): void;
};
```

- `getLastMessageId` — reads the stored last-seen message id, or `undefined` if none.
- `setLastMessageId` — persists the last-seen message id for use in the next `room:join` WebSocket message (enables `messages:sync` replay on reconnect).

## Test strategy

- Tests run in jsdom; `localStorage` is available natively.
- `beforeEach(() => localStorage.clear())` prevents test pollution.
- Key-isolation test verifies two conversations write to separate keys.
