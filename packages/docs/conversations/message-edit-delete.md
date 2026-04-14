# Message Edit & Delete

## Overview

Visitors and operators can edit or delete their own messages within active conversations. Edits are tracked via an `editedAt` timestamp on the message row; deletes use the existing `deletedAt` soft-delete column. All mutations are broadcast to every participant in the conversation room (including the sender) to support multi-tab synchronization.

## Authorization

Only the original sender of a message can edit or delete it. The ownership check compares `msg.senderId` against the authenticated `userId` from the WebSocket connection context.

- If the message does not exist (or is already soft-deleted), the server returns a `MessageNotFoundError`.
- If the authenticated user is not the sender, the server returns a `NotMessageSenderError`.

Admins and super_admins do **not** have elevated privileges for editing or deleting other users' messages. This is intentional: message integrity is preserved for audit purposes.

## Database

### Schema change

A single column was added to the `delivery_chat_messages` table:

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `edited_at` | timestamp | yes | -- | Set when the message content is updated. `NULL` means never edited. |

Soft delete continues to use the existing `deleted_at` column. No new indexes are required.

### Edit operation

```sql
UPDATE delivery_chat_messages
SET content = $1, edited_at = now(), updated_at = now()
WHERE id = $2 AND deleted_at IS NULL;
```

### Delete operation

```sql
UPDATE delivery_chat_messages
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;
```

## WebSocket Events

### Client to Server

#### `message:edit`

Edit the content of a previously sent message.

```typescript
{
  type: "message:edit",
  payload: {
    conversationId: string,  // UUID of the conversation
    messageId: string,       // UUID of the message to edit
    content: string          // New message content (max 10,000 characters)
  }
}
```

**Authorization:** `msg.senderId === userId`. Conversation must not be closed.

#### `message:delete`

Soft-delete a previously sent message.

```typescript
{
  type: "message:delete",
  payload: {
    conversationId: string,  // UUID of the conversation
    messageId: string        // UUID of the message to delete
  }
}
```

**Authorization:** `msg.senderId === userId`. Conversation must not be closed.

### Server to Client

Both events are broadcast to **all** room participants, including the sender. There is no `excludeConnectionId` -- this ensures multi-tab sync works correctly (the sender's other tabs also receive the update).

#### `message:edited`

Broadcast when a message is successfully edited.

```typescript
{
  type: "message:edited",
  payload: {
    conversationId: string,
    messageId: string,
    content: string,         // Updated content
    editedAt: string,        // ISO timestamp
    senderId: string         // Who edited (always the original sender)
  }
}
```

#### `message:deleted`

Broadcast when a message is successfully soft-deleted.

```typescript
{
  type: "message:deleted",
  payload: {
    conversationId: string,
    messageId: string,
    senderId: string         // Who deleted (always the original sender)
  }
}
```

## Service Functions

Both functions live in `chat.service.ts`.

### `editMessage(input)`

```typescript
interface EditMessageInput {
  messageId: string;
  conversationId: string;
  userId: string;
  content: string;
}
```

Flow:
1. Fetch the message by ID (must not be soft-deleted).
2. Verify `msg.senderId === userId` -- throw `NotMessageSenderError` if not.
3. Verify the conversation is not closed -- throw error if it is.
4. Update `content`, `editedAt`, and `updatedAt` in a single query.
5. Return the updated message.

### `deleteMessage(input)`

```typescript
interface DeleteMessageInput {
  messageId: string;
  conversationId: string;
  userId: string;
}
```

Flow:
1. Fetch the message by ID (must not be soft-deleted).
2. Verify `msg.senderId === userId` -- throw `NotMessageSenderError` if not.
3. Verify the conversation is not closed -- throw error if it is.
4. Set `deletedAt` and `updatedAt`.
5. Return void.

### Error Classes

| Error | Code | When |
|---|---|---|
| `MessageNotFoundError` | `MESSAGE_NOT_FOUND` | Message does not exist or is already deleted |
| `NotMessageSenderError` | `NOT_MESSAGE_SENDER` | Authenticated user is not the original sender |

## Widget UX

### Interaction Pattern

The widget follows a WhatsApp-style interaction model:

- **Desktop:** Hovering over a message bubble reveals edit and delete action icons.
- **Mobile:** Long-pressing a message bubble reveals the same actions.
- Actions are only shown on messages sent by the current user.

### Bubble States

| State | Display |
|---|---|
| Normal | Standard message bubble |
| Edited | Message content + "(edited)" label below the text |
| Deleted | Gray placeholder: "This message was deleted" (no content shown) |
| Editing | Inline textarea replaces the message content with save/cancel controls |

### Optimistic Updates

When the user triggers an edit or delete:
1. The local state is updated immediately (optimistic).
2. The WebSocket event (`message:edit` or `message:delete`) is sent to the server.
3. The server broadcast (`message:edited` or `message:deleted`) confirms the change for all participants.

If the WebSocket event fails, the client should revert the optimistic update.

### Delete Confirmation

Before deleting, the widget shows a confirmation prompt to prevent accidental deletions.

## Edge Cases

- **Pending/failed messages:** Edit and delete actions are not available on messages that have not yet been acknowledged by the server (no `serverMessageId`).
- **Closed conversations:** The server rejects edit and delete attempts on messages within closed conversations. The widget hides action icons when the conversation status is `closed`.
- **System messages:** Messages with `type: "system"` cannot be edited or deleted (they have no sender ownership).
- **Already deleted:** Attempting to edit or delete an already-deleted message returns `MessageNotFoundError`.
- **Empty content:** Edit requests with empty or whitespace-only content are rejected by validation.
- **Concurrent edits:** Last-write-wins. The `editedAt` timestamp reflects the most recent edit.
