# Message Edit & Delete — Backend Implementation

## Service Functions

Both functions are exported from `chat.service.ts` and called by the WebSocket event handler in `chat.handlers.ts`.

### `editMessage(input: EditMessageInput)`

```typescript
interface EditMessageInput {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
}
```

**Validation flow:**

1. Query `delivery_chat_messages` by `id` + `conversationId` where `deletedAt IS NULL`.
2. If no row is returned, throw `MessageNotFoundError`.
3. Compare `msg.senderId` against `input.senderId`. If they differ, throw `NotMessageSenderError`.
4. Check 15-minute time window from `msg.createdAt`. If expired, throw `MessageEditWindowExpiredError`.
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
  senderId: string;
}
```

**Validation flow:**

1. Query `delivery_chat_messages` by `id` + `conversationId` where `deletedAt IS NULL`.
2. If no row is returned, throw `MessageNotFoundError`.
3. Compare `msg.senderId` against `input.senderId`. If they differ, throw `NotMessageSenderError`.
4. Check 15-minute time window from `msg.createdAt`. If expired, throw `MessageEditWindowExpiredError`.
5. Execute soft delete:
   ```sql
   UPDATE delivery_chat_messages
   SET deleted_at = now(), updated_at = now()
   WHERE id = $1;
   ```
6. Return the soft-deleted message row.

## 15-Minute Edit/Delete Time Window

Both `editMessage()` and `deleteMessage()` enforce a 15-minute time window from the message's `createdAt` timestamp. After 15 minutes (inclusive — `elapsed >= 15min` is rejected), the operation is denied with `MessageEditWindowExpiredError`.

**Constant:** `EDIT_WINDOW_MINUTES = 15` (defined in `chat.service.ts`)

**Enforcement logic:**
```typescript
const elapsed = Date.now() - new Date(msg.createdAt).getTime();
if (elapsed >= EDIT_WINDOW_MINUTES * 60 * 1000) {
  throw new MessageEditWindowExpiredError(messageId, msg.createdAt, EDIT_WINDOW_MINUTES);
}
```

**Validation order:** message existence → sender ownership → time window → execute operation.

The check lives in the service layer, so all callers (WebSocket handlers and REST API routes) automatically inherit it.

## Error Classes

### `MessageNotFoundError`

- **WS Code:** `MESSAGE_NOT_FOUND`
- **HTTP-equivalent:** 404
- **Thrown when:** The message ID does not exist, belongs to a different conversation, or has already been soft-deleted.

### `NotMessageSenderError`

- **WS Code:** `FORBIDDEN`
- **HTTP-equivalent:** 403
- **Thrown when:** The authenticated user does not match `msg.senderId`.

### `MessageEditWindowExpiredError`

- **WS Code:** `EDIT_WINDOW_EXPIRED`
- **HTTP-equivalent:** 422
- **Thrown when:** The message's `createdAt` is 15 or more minutes in the past.
- **Error properties:** `createdAt` (ISO string of message creation), `expiresAt` (ISO string of when the window closed), `windowMinutes` (15). Clients can use these to display a meaningful message.

## Handler Flow

The WebSocket handler in `chat.handlers.ts` processes `message:edit` and `message:delete` events:

```
Client sends WS event
  → Parse and validate payload (Zod schema)
  → Resolve connection context (userId, organizationId)
  → Call service function (editMessage / deleteMessage)
  → On success: broadcast to room (all participants)
  → On error: send `error` event back to the sender connection
```

### Broadcast behavior

Both `message:edited` and `message:deleted` are broadcast to **all** connections in the conversation room, including the sender's connection. This differs from `message:new` (which excludes the sender). The reason is multi-tab sync: if a user has the chat open in two tabs, both tabs must reflect the edit/delete.

### Authorization

Ownership is checked at the service layer, not the handler. The handler trusts the `conn.userId` from the authenticated WebSocket connection context — this value is set during the WebSocket upgrade handshake and cannot be spoofed by the client.

```
conn.userId === msg.senderId  // ownership check in service
```

No role-based override exists. Admins cannot edit or delete other users' messages.
