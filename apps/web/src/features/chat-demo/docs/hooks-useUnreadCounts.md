# useUnreadCounts

## Responsibility

Owns the per-conversation unread message counters. Exposes imperative operations to clear counts on open and refresh counts from the API on new-message events.

## Owned state

- `unreadCounts: Record<string, number>` — map of conversationId → unread count.

## Exposed API

```ts
function useUnreadCounts(client: ChatClient): {
  unreadCounts: Record<string, number>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  clearUnread(conversationId: string): void;
  refreshUnread(conversationId: string): Promise<void>;
}
```

- `clearUnread` — sets the count to 0, called when a conversation is opened.
- `refreshUnread` — fetches the live count from `GET /conversations/:id/unread` and updates state. Network errors are swallowed (non-fatal).
- `setUnreadCounts` — exposed for bulk updates from WebSocket side-effects.

## Test strategy

- Mock `client.getUnreadCount` to control the returned count.
- Tests verify clear sets count to 0 while preserving other conversations.
- Tests verify refresh updates state with the server value.
- Tests verify network errors do not throw.
