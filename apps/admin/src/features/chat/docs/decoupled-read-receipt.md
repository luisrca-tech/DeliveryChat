# Decoupled Read-Receipt from List Refresh

## Problem

When a visitor message arrived in the active conversation, the `message:new` WebSocket handler chained `invalidateQueries` inside `markConversationAsRead().then()`. This added 50-200ms of latency before the conversation list refreshed, because the list invalidation waited for the read-receipt HTTP round-trip to complete.

Messages arriving in non-active conversations already invalidated the list immediately, so only the active-conversation path was affected.

## Solution

`invalidateQueries` now fires immediately on every `message:new` event, regardless of whether the conversation is active. `markConversationAsRead()` still fires for visitor messages in the active conversation, but as a fire-and-forget side effect that does not block the list refresh.

### Before

```
message:new (active, visitor) → markConversationAsRead() → then(invalidateQueries)
message:new (other)           → invalidateQueries
```

### After

```
message:new (any)             → invalidateQueries (immediate)
message:new (active, visitor) → markConversationAsRead() (fire-and-forget)
```

## Implementation

The `message:new` handler logic was extracted from `useWebSocket.ts` into a pure function `handleMessageNew()` in `handleMessageNew.ts`. This function:

1. Deduplicates messages by ID (capped at 500 entries)
2. Updates the messages query cache via `setQueryData`
3. Fires `invalidateQueries` immediately
4. Calls `markAsRead` as fire-and-forget only for visitor messages in the active conversation

`useWebSocket.ts` now delegates to `handleMessageNew()` with injected dependencies, making the core logic testable without React or WebSocket infrastructure.

## Trade-offs

- Unread counts may briefly show stale data (the count resets when the read-receipt completes and the next invalidation reconciles). This is acceptable because the user is already viewing the conversation.
- The read-receipt is fire-and-forget, so a transient failure is silently logged. The next message or manual focus will retry.
