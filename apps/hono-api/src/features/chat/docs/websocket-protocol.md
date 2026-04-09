# WebSocket Protocol

## Connection

### Admin App (Session Auth)
```
ws://localhost:8000/v1/ws?tenant=<slug>
```
Session cookie is sent automatically. The `tenant` query param identifies the organization.

### Widget (API Key Auth)
```
ws://localhost:8000/v1/ws?token=dk_live_<key>&appId=<uuid>
```
API key and application ID passed as query parameters since WebSocket does not support custom cross-origin headers.

## Authentication

Authentication happens during the HTTP upgrade phase (`onOpen`). If auth fails, the server sends an `error` event with code `UNAUTHORIZED` and closes the connection with status 1008.

Both paths resolve to an `AuthenticatedWSUser`:
```typescript
{
  userId: string;
  organizationId: string;
  role: "visitor" | "operator" | "admin";
  authType: "session" | "apiKey";
  applicationId?: string; // present for widget connections
}
```

The `super_admin` member role maps to `admin` participant role.

## Events

### Client to Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ conversationId: uuid, lastMessageId?: uuid }` | Join a conversation room. Server verifies participant membership. If `lastMessageId` is provided, missed messages are sent via `messages:sync`. |
| `room:leave` | `{ conversationId: uuid }` | Leave a conversation room. |
| `message:send` | `{ conversationId: uuid, content: string, clientMessageId: string }` | Send a message. Content is trimmed, max 10,000 chars. `clientMessageId` is echoed back in the ACK for optimistic UI matching. |
| `ping` | (none) | Heartbeat. Server responds with `pong`. |

### Server to Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ id, conversationId, senderId, senderName, senderRole, content, type, createdAt }` | New message broadcast to all room participants except the sender. |
| `message:ack` | `{ clientMessageId, serverMessageId, createdAt }` | Sent to the message sender to confirm persistence. |
| `messages:sync` | `{ conversationId, messages[] }` | Missed messages sent on reconnection when `lastMessageId` is provided in `room:join`. |
| `conversation:new` | `{ id, organizationId, applicationId, status, subject, createdAt }` | Notification of a new conversation (for operator/admin dashboards). |
| `error` | `{ code, message }` | Error response. Codes: `PARSE_ERROR`, `VALIDATION_ERROR`, `FORBIDDEN`, `UNAUTHORIZED`. |
| `pong` | (none) | Heartbeat response. |

## Message Flow

1. Client sends `message:send` with `clientMessageId` (generated client-side)
2. Server validates payload with Zod schema
3. Server verifies conversation is `active`
4. Server inserts into `messages` table, gets back full row with `id` and `createdAt`
5. Server sends `message:ack` to the sender with `serverMessageId`
6. Server broadcasts `message:new` to all other connections in the room

## Reconnection

1. Client stores the last received `messageId` in local storage
2. On reconnect, client sends `room:join` with `lastMessageId`
3. Server queries messages created after the last received message
4. Server sends `messages:sync` with the missed messages array
5. Client merges into its local state

## Room Management

- 1 WebSocket connection per client, multiplexing conversations via `room:join`/`room:leave`
- Rooms are in-memory `Map<conversationId, Map<connectionId, WSConnection>>`
- Tenant isolation enforced at `room:join` time via participant membership check
- `disconnectUser()` cleans up all rooms on connection close or error

## Conversation Patterns

| Pattern | Participants |
|---------|--------------|
| Visitor to Operator | visitor + operator |
| Admin escalation (iFood model) | visitor + operator + admin |
| Internal team chat | operator + admin |
