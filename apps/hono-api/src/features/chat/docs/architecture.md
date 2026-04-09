# Chat Feature Architecture

## Overview

Real-time messaging system using WebSocket for message delivery and REST endpoints for state mutations (conversation CRUD, participant management).

## Key Design Decisions

### Single WS Connection per Client
One WS connection multiplexes all conversations through `room:join`/`room:leave`. An operator handling 20 conversations uses 1 connection, not 20.

### REST for State Mutations, WS for Real-Time
Creating conversations, closing, managing participants — these use the full Hono middleware chain (`requireTenantAuth`, `checkBillingStatus`, `requireRole`). Keeping them REST avoids duplicating this logic in the WS handler.

### IRoomManager Interface
`InMemoryRoomManager` implements `IRoomManager`. When horizontal scaling is needed, swap to `RedisRoomManager` that publishes to Redis channels. The interface is:
```typescript
interface IRoomManager {
  join(conversationId: string, connection: WSConnection): void;
  leave(conversationId: string, connectionId: string): void;
  broadcast(conversationId: string, event: string, excludeConnectionId?: string): void;
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

## File Structure

```
apps/hono-api/src/
  features/chat/
    room-manager.ts         # IRoomManager + InMemoryRoomManager
    chat.service.ts         # DB operations (createConversation, sendMessage, etc.)
    chat.schemas.ts         # Zod schemas for WS event payloads
    chat.handlers.ts        # WS event dispatcher
    __tests__/              # Unit tests
    docs/                   # This documentation
  lib/
    ws.ts                   # WebSocket server setup (createNodeWebSocket)
    middleware/
      wsAuth.ts             # WebSocket authentication
  routes/
    ws.ts                   # WS route + room manager singleton
    conversations.ts        # Admin REST endpoints
    schemas/
      conversations.ts      # REST endpoint schemas
packages/types/src/
  ws-events.ts              # Shared WS event type definitions
```

## Scaling Path

1. **Current (MVP):** In-memory rooms, single server instance
2. **Redis pub/sub:** Each instance subscribes to Redis channels per conversation. Broadcast publishes to Redis instead of local Map.
3. **BullMQ:** Background jobs for offline notifications, message delivery guarantees
4. **LLM/RAG:** AI-powered auto-responses using conversation history
