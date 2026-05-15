# Chat Feature Architecture

## Overview

Real-time messaging system using WebSocket for message delivery and REST endpoints for state mutations (conversation CRUD, participant management).

## Key Design Decisions

### Single WS Connection per Client

One WS connection multiplexes all conversations through `room:join`/`room:leave`. An operator handling 20 conversations uses 1 connection, not 20.

### REST for State Mutations, WS for Real-Time

Creating conversations, closing, managing participants — these use the full Hono middleware chain (`requireAuth`, `requireMember`, `checkBillingStatus`). Keeping them REST avoids duplicating this logic in the WS handler.

### IRoomManager Interface

`InMemoryRoomManager` implements `IRoomManager`. When horizontal scaling is needed, swap to `RedisRoomManager` that publishes to Redis channels. The interface is:

```typescript
interface IRoomManager {
  join(conversationId: string, connection: WSConnection): void;
  leave(conversationId: string, connectionId: string): void;
  broadcast(
    conversationId: string,
    event: string,
    excludeConnectionId?: string,
  ): void;
  getConnections(conversationId: string): WSConnection[];
  getUserRooms(userId: string): string[];
  disconnectUser(userId: string): void;
}
```

### Support Conversations Require applicationId

Business rule enforced in `chat.service.ts`: `support` type conversations must have an `applicationId` (inferred from the widget's API key). `internal` conversations can optionally have one. The DB column stays nullable for flexibility.

### Dual Auth for WebSocket

- Admin app: session cookie (automatic, same-origin)
- Widget: query params (`token` + `appId`) since WS doesn't support custom cross-origin headers

### Thin Route Handlers, Fat Service Layer

All database queries live in `chat.service.ts`. Route handlers are thin wrappers: parse input → call service → return response. Both member and visitor code paths call the same service functions with appropriate scoping parameters. No `db.select()` or `db.insert()` calls exist in route files.

### Unified Auth Model

`conversations.ts` uses the unified `requireAuth()` middleware which produces a discriminated union context (`type: "member"` or `type: "visitor"`). Route handlers branch on `auth.type` to apply appropriate scoping. Member-only endpoints use `requireMember()` as an additional guard.

## File Structure

```
apps/hono-api/src/
  features/chat/
    room-manager.ts         # IRoomManager + InMemoryRoomManager
    chat.service.ts         # All DB operations (conversations, messages, unread, etc.)
    broadcasting.service.ts # WebSocket event building and broadcasting
    error-mapper.ts         # Maps service errors to HTTP responses
    visitor.service.ts      # Shared visitor identity resolution (resolveOrCreateVisitor)
    chat.schemas.ts         # Zod schemas for WS event payloads
    chat.handlers.ts        # WS event dispatcher
    __tests__/              # Unit tests
    docs/                   # This documentation
  lib/
    ws.ts                   # WebSocket server setup (createNodeWebSocket)
    middleware/
      unifiedAuth.ts        # requireAuth(), requireMember(), getUnifiedAuth()
      unifiedRateLimit.ts   # Unified rate limiting (branches on auth type)
      wsAuth.ts             # WebSocket authentication
  routes/
    ws.ts                   # WS route + room manager singleton
    conversations.ts        # Unified REST endpoints (member + visitor)
    widget.ts               # Widget-specific endpoints (settings, ws-token)
    schemas/
      conversations.ts      # REST endpoint schemas
packages/types/src/
  ws-events.ts              # Shared WS event type definitions
```

## Service Layer (`chat.service.ts`)

All database operations are centralized in `chat.service.ts`. Key function groups:

| Category                   | Functions                                                                                                      | Notes                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Conversation CRUD**      | `createConversation`, `getConversationWithParticipants`, `softDeleteConversation`, `updateConversationSubject` | Returns `null` on not-found                                                 |
| **Conversation Lifecycle** | `acceptConversation`, `leaveConversation`, `resolveConversation`                                               | Race-condition safe (WHERE assignedTo IS NULL)                              |
| **Listing**                | `listConversationsForMember`, `listConversationsForVisitor`                                                    | Member version includes filtering, role-based visibility, and unread counts |
| **Messages**               | `sendMessage`, `editMessage`, `deleteMessage`, `getMessageHistory`, `getMessageHistoryForMember`               | Member version joins sender name/role; edit/delete enforce 15-min window    |
| **Participants**           | `addParticipant`, `isParticipant`                                                                              | Unique constraint on (conversationId, userId)                               |
| **Read State**             | `markAsRead`, `getUnreadCount`, `getUnreadCountForVisitor`, `getBulkUnreadCounts`                              | Bulk version used by member list endpoint                                   |
| **System Messages**        | `createSystemMessage`                                                                                          | For lifecycle events (accepted, left, resolved)                             |
| **Visitor Identity**       | `resolveOrCreateVisitor` (in `visitor.service.ts`)                                                             | Creates anonymous user on first contact                                     |

### Error Contract

Service functions use two patterns:

- **Return `null`**: `getConversationWithParticipants`, `acceptConversation`, `leaveConversation`, `resolveConversation`, `softDeleteConversation`, `updateConversationSubject`
- **Throw typed errors**: `sendMessage`, `editMessage`, `deleteMessage`, `getMessageHistoryForMember`

Typed errors (`ConversationNotFoundError`, `NotMessageSenderError`, `MessageEditWindowExpiredError`, etc.) are mapped to HTTP responses by `error-mapper.ts` via `mapServiceErrorToResponse()`.

## Scaling Path

1. **Current (MVP):** In-memory rooms, single server instance
2. **Redis pub/sub:** Each instance subscribes to Redis channels per conversation. Broadcast publishes to Redis instead of local Map.
3. **BullMQ:** Background jobs for offline notifications, message delivery guarantees
4. **LLM/RAG:** AI-powered auto-responses using conversation history
