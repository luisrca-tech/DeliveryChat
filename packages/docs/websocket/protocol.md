# WebSocket Protocol Reference

All event types and payloads are defined in `packages/types/src/ws-events.ts` and shared across server, admin, and widget.

## Endpoint

```
GET /v1/ws
```

Upgrade to WebSocket. Authentication via query parameters (see [authentication.md](./authentication.md)).

## Message Format

All messages are JSON strings with a discriminated union structure:

```typescript
{ type: string; payload?: object }
```

## Client → Server Events

### `room:join`

Join a conversation room to receive real-time messages. If `lastMessageId` is provided, the server responds with a `messages:sync` event containing all messages sent after that ID (reconnection support).

```typescript
{
  type: "room:join",
  payload: {
    conversationId: string,  // UUID of the conversation
    lastMessageId?: string   // UUID of the last message the client has
  }
}
```

**Authorization:** User must be a participant of the conversation.

### `room:leave`

Leave a conversation room. Stops receiving messages for that conversation.

```typescript
{
  type: "room:leave",
  payload: {
    conversationId: string
  }
}
```

### `message:send`

Send a message to a conversation. The server persists it, sends an `message:ack` back to the sender, and broadcasts `message:new` to all other room members.

```typescript
{
  type: "message:send",
  payload: {
    conversationId: string,
    content: string,          // Max 10,000 characters
    clientMessageId: string   // Client-generated UUID for optimistic UI
  }
}
```

**Authorization:**
- **Visitors:** Must be a participant of the conversation
- **Operators/Admins:** Must be the assigned operator (`assignedTo` field)

### `typing:start`

Broadcast a typing indicator to other room members. The server relays this with the sender's name and role.

```typescript
{
  type: "typing:start",
  payload: {
    conversationId: string
  }
}
```

### `typing:stop`

Explicitly stop the typing indicator. Clients also auto-clear after 3 seconds if no `typing:stop` is received.

```typescript
{
  type: "typing:stop",
  payload: {
    conversationId: string
  }
}
```

### `ping`

Heartbeat to keep the connection alive. Server responds with `pong`.

```typescript
{ type: "ping" }
```

---

## Server → Client Events

### `message:new`

A new message was sent in a room the client has joined. Broadcast to all room members except the sender (sender receives `message:ack` instead).

```typescript
{
  type: "message:new",
  payload: {
    id: string,                    // Server-assigned UUID
    conversationId: string,
    senderId: string,
    senderName: string,
    senderRole: "visitor" | "operator" | "admin",
    content: string,
    type: "text" | "system",
    createdAt: string              // ISO timestamp
  }
}
```

### `message:ack`

Confirms the server persisted a message. Sent only to the original sender. Used by clients to replace optimistic (pending) messages with server-confirmed data.

```typescript
{
  type: "message:ack",
  payload: {
    clientMessageId: string,       // Matches the client-generated ID
    serverMessageId: string,       // Server-assigned UUID
    createdAt: string              // Server-assigned timestamp
  }
}
```

### `messages:sync`

Sent after a `room:join` that includes `lastMessageId`. Contains all messages the client missed while disconnected.

```typescript
{
  type: "messages:sync",
  payload: {
    conversationId: string,
    messages: MessageNewPayload[]  // Same shape as message:new payload
  }
}
```

### `conversation:new`

A visitor created a new conversation. Broadcast to all connections in the organization so the operator queue updates in real-time.

```typescript
{
  type: "conversation:new",
  payload: {
    id: string,
    organizationId: string,
    applicationId: string | null,
    status: "pending",
    subject: string | null,
    createdAt: string
  }
}
```

**Trigger:** `POST /v1/widget/conversations` (REST)

### `conversation:accepted`

An operator accepted a pending conversation. Broadcast org-wide to remove it from other operators' queues.

```typescript
{
  type: "conversation:accepted",
  payload: {
    conversationId: string,
    assignedTo: string,           // User ID of the operator
    assignedToName: string
  }
}
```

**Trigger:** `POST /v1/conversations/:id/accept` (REST)

### `conversation:released`

An operator released an active conversation back to the pending queue. Broadcast org-wide.

```typescript
{
  type: "conversation:released",
  payload: {
    conversationId: string
  }
}
```

**Trigger:** `POST /v1/conversations/:id/leave` (REST)

### `conversation:resolved`

A conversation was marked as solved/closed. Broadcast org-wide.

```typescript
{
  type: "conversation:resolved",
  payload: {
    conversationId: string,
    resolvedBy: string            // User ID who resolved
  }
}
```

**Trigger:** `POST /v1/conversations/:id/resolve` (REST)

### `typing:start` (broadcast)

Relayed from another user in the same room. Includes sender identity for UI display.

```typescript
{
  type: "typing:start",
  payload: {
    conversationId: string,
    userId: string,
    userName: string | null,
    senderRole: "visitor" | "operator" | "admin"
  }
}
```

### `typing:stop` (broadcast)

Relayed typing stop from another user.

```typescript
{
  type: "typing:stop",
  payload: {
    conversationId: string,
    userId: string
  }
}
```

### `error`

Sent when the server encounters an error processing a client event.

```typescript
{
  type: "error",
  payload: {
    code: string,
    message: string
  }
}
```

### `pong`

Response to a `ping` heartbeat.

```typescript
{ type: "pong" }
```

---

## Error Codes

| Code | Meaning | When |
|---|---|---|
| `UNAUTHORIZED` | Authentication failed | Invalid session, expired token, bad appId |
| `PARSE_ERROR` | Malformed JSON | Client sent non-JSON data |
| `VALIDATION_ERROR` | Schema validation failed | Missing/invalid fields in event payload |
| `FORBIDDEN` | Not authorized for action | Not a participant, not assigned to conversation |
| `CONVERSATION_NOT_FOUND` | Conversation does not exist | Invalid or deleted conversation ID |
| `CONVERSATION_NOT_ACTIVE` | Conversation is closed/pending | Trying to send to a non-active conversation |

## Heartbeat

| Client | Interval | Mechanism |
|---|---|---|
| Admin dashboard | 30 seconds | `setInterval` ping/pong |
| Widget | 25 seconds | `setInterval` ping/pong |

If the server does not receive a ping within the expected window, the connection may be considered stale. Clients implement auto-reconnect with exponential backoff on disconnect.
