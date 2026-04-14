# Message Edit & Delete -- Backend Implementation

## Service Functions

Both functions are exported from `chat.service.ts` and called by the WebSocket event handler in `ws.ts`.

### `editMessage(input: EditMessageInput)`

```typescript
interface EditMessageInput {
  messageId: string;
  conversationId: string;
  userId: string;
  content: string;
}
```

**Validation flow:**

1. Query `delivery_chat_messages` by `id` where `deletedAt IS NULL`.
2. If no row is returned, throw `MessageNotFoundError`.
3. Compare `msg.senderId` against `input.userId`. If they differ, throw `NotMessageSenderError`.
4. Verify conversation status is not `closed` (query `delivery_chat_conversations` by `conversationId`).
5. Execute update:
   ```sql
   UPDATE delivery_chat_messages
   SET content = $1, edited_at = now(), updated_at = now()
   WHERE id = $2;
   ```
6. Return the updated message row.

### `deleteMessage(input: DeleteMessageInput)`

```typescript
interface DeleteMessageInput {
  messageId: string;
  conversationId: string;
  userId: string;
}
```

**Validation flow:**

1. Query `delivery_chat_messages` by `id` where `deletedAt IS NULL`.
2. If no row is returned, throw `MessageNotFoundError`.
3. Compare `msg.senderId` against `input.userId`. If they differ, throw `NotMessageSenderError`.
4. Verify conversation status is not `closed`.
5. Execute soft delete:
   ```sql
   UPDATE delivery_chat_messages
   SET deleted_at = now(), updated_at = now()
   WHERE id = $1;
   ```
6. Return void.

## Error Classes

Both errors extend a base `ChatError` class and include a machine-readable `code` property.

### `MessageNotFoundError`

- **Code:** `MESSAGE_NOT_FOUND`
- **HTTP-equivalent:** 404
- **Thrown when:** The message ID does not exist or the message has already been soft-deleted.

### `NotMessageSenderError`

- **Code:** `NOT_MESSAGE_SENDER`
- **HTTP-equivalent:** 403
- **Thrown when:** The authenticated user (`conn.userId`) does not match `msg.senderId`.

## Handler Flow

The WebSocket handler in `ws.ts` processes `message:edit` and `message:delete` events:

```
Client sends WS event
  -> Parse and validate payload (Zod schema)
  -> Resolve connection context (userId, organizationId)
  -> Call service function (editMessage / deleteMessage)
  -> On success: broadcast to room (all participants, no excludeConnectionId)
  -> On error: send `error` event back to the sender connection
```

### Broadcast behavior

Both `message:edited` and `message:deleted` are broadcast to **all** connections in the conversation room, including the sender's connection. This differs from `message:new` (which excludes the sender). The reason is multi-tab sync: if a user has the chat open in two tabs, both tabs must reflect the edit/delete.

### Authorization

Ownership is checked at the service layer, not the handler. The handler trusts the `conn.userId` from the authenticated WebSocket connection context -- this value is set during the WebSocket upgrade handshake and cannot be spoofed by the client.

```
conn.userId === msg.senderId  // ownership check in service
```

No role-based override exists. Admins cannot edit or delete other users' messages.

## Conversation Status Guard

Both operations are blocked when the conversation status is `closed`. The service queries the conversation row and rejects the request if `status === 'closed'`. This matches the existing behavior for `message:send`.
