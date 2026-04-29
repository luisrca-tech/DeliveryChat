# Query Consolidation — Message Send Hot Path

## Problem

The message-send hot path previously executed 4 sequential queries to the `conversations` table:

1. `validateSendAuthorization()` — SELECT (status, assignedTo, organizationId)
2. `sendMessage()` — SELECT (status, organizationId)
3. `handleMessageSend()` — SELECT (assignedTo) for broadcast payload

Queries 2 and 3 were redundant — the data was already fetched in step 1.

## Solution

### `validateSendAuthorization()` returns conversation data

Changed from `Promise<void>` to `Promise<ConversationData>`, where `ConversationData` contains `{ status, assignedTo, organizationId }`. The authorization logic is unchanged; the function now returns the row it already queried.

### `sendMessage()` accepts optional pre-fetched data

Added an optional second parameter `conversationData?: ConversationData`. When provided, the function skips its own SELECT query. The caller is responsible for ensuring the data is valid (which it is, since it comes from `validateSendAuthorization`).

### `handleMessageSend()` uses the returned data

The handler captures the return value of `validateSendAuthorization()`, passes it to `sendMessage()`, and uses `conversationData.assignedTo` directly in the broadcast payload — eliminating the third redundant SELECT.

### `updatedAt` bump on new messages

`sendMessage()` now updates `conversations.updatedAt = now()` after inserting the message. This ensures the conversation list (sorted by `DESC updatedAt`) reflects the most recent activity. Only new messages bump `updatedAt` — edits and deletes do not.

## Query count (after)

- **Staff sender**: 1 SELECT (validation) + 1 INSERT (message) + 1 UPDATE (updatedAt) = 3 queries
- **Visitor sender**: 1 SELECT (validation) + 1 SELECT (participant check) + 1 INSERT + 1 UPDATE = 4 queries
