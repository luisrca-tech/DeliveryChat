# InMemoryRoomManager

The room manager is the core connection tracking system for WebSocket. It manages three levels of connection state and provides scoped broadcast methods.

**Source:** `apps/hono-api/src/features/chat/room-manager.ts`

## Three-Level Tracking

```
Level 1: Rooms (conversation-scoped)
  rooms: Map<conversationId, Map<connectionId, WSConnection>>
  Purpose: Targeted broadcasts within a conversation (messages, typing)

Level 2: User Connections (user-scoped)
  userConnections: Map<userId, Set<conversationId>>
  Purpose: Track which rooms a user is in (supports multi-tab)

Level 3: Organization Connections (org-wide)
  orgConnections: Map<organizationId, Map<connectionId, WSConnection>>
  Purpose: Broadcast lifecycle events to all staff in a tenant
```

### Visual Representation

```
Organization "acme-corp"
├── orgConnections
│   ├── conn-1 (operator-alice, tab 1)
│   ├── conn-2 (operator-alice, tab 2)
│   └── conn-3 (operator-bob)
│
├── Room "conv-001" (pending → active)
│   ├── conn-1 (operator-alice)
│   └── conn-4 (visitor-jane)
│
└── Room "conv-002" (active)
    ├── conn-3 (operator-bob)
    └── conn-5 (visitor-mike)

userConnections:
  operator-alice → { conv-001 }
  operator-bob   → { conv-002 }
  visitor-jane   → { conv-001 }
  visitor-mike   → { conv-002 }
```

## IRoomManager Interface

```typescript
interface IRoomManager {
  // Room-level operations (Level 1)
  join(conversationId: string, connection: WSConnection): void;
  leave(conversationId: string, connectionId: string): void;
  broadcast(conversationId: string, event: string, excludeConnectionId?: string): void;
  getConnections(conversationId: string): Map<string, WSConnection>;

  // User-level operations (Level 2)
  getUserRooms(userId: string): Set<string>;

  // Organization-level operations (Level 3)
  registerConnection(connection: WSConnection): void;
  unregisterConnection(connectionId: string, organizationId: string): void;
  broadcastToOrganization(organizationId: string, event: string, excludeConnectionId?: string): void;
}
```

## Methods in Detail

### `join(conversationId, connection)`

Adds a connection to a conversation room.

- Creates the room `Map` if it doesn't exist yet
- Adds the connection to the room
- Tracks the room in `userConnections` for the user

**Called by:** `handleRoomJoin()` in `chat.handlers.ts` after verifying the user is a participant.

### `leave(conversationId, connectionId)`

Removes a connection from a conversation room.

- Removes the connection from the room
- Removes the room from `userConnections` for the user
- **Auto-cleanup:** If the room becomes empty, the entire room entry is deleted from the `Map`

**Called by:** `handleRoomLeave()` or during disconnect cleanup.

### `broadcast(conversationId, event, excludeConnectionId?)`

Sends a JSON event to all connections in a room, optionally excluding one (typically the sender).

**Used for:** `message:new`, `typing:start`, `typing:stop`

### `registerConnection(connection)`

Registers a connection at the organization level. Called immediately after successful authentication.

- Adds to `orgConnections[organizationId]`
- Enables organization-wide broadcasts to reach this connection

### `unregisterConnection(connectionId, organizationId)`

Removes a connection from organization tracking. Called on disconnect.

- Removes from `orgConnections`
- Leaves all rooms the connection was in (iterates `userConnections`)
- Cleans up empty org entries

### `broadcastToOrganization(organizationId, event, excludeConnectionId?)`

Sends a JSON event to all connections in an organization.

**Used for:** `conversation:new`, `conversation:accepted`, `conversation:released`, `conversation:resolved`

### `getUserRooms(userId)`

Returns the set of conversation IDs a user is currently in. Useful for determining if a user needs notifications vs. in-room delivery.

### `getConnections(conversationId)`

Returns all connections in a room. Used by handlers to check if a specific user is currently in the room.

## Design Decisions

### Why In-Memory?

The room manager uses plain `Map` data structures with no external persistence. This is intentional:

1. **Room membership is ephemeral** — it represents "who is currently viewing this conversation," not permanent state
2. **Simplicity** — no Redis dependency, no serialization, no TTL management
3. **Performance** — O(1) lookups for rooms, connections, and users
4. **Recovery** — clients auto-reconnect and re-join rooms on disconnect, so state rebuilds naturally

### Trade-offs

| Benefit | Limitation |
|---|---|
| Zero external dependencies | State lost on server restart |
| Sub-millisecond operations | Not shared across server instances |
| Automatic cleanup | Must scale to Redis for multi-instance deployment |
| Simple debugging | No persistence for analytics |

### Future: Redis Migration

For horizontal scaling (multiple server instances), the room manager will migrate to Redis pub/sub. The `IRoomManager` interface is designed to make this swap transparent — only the implementation changes, not the callers. See `packages/docs/rate-limiting/to-do/redis-migration.md` for the broader Redis migration plan.

## Cleanup Behavior

The room manager automatically cleans up state:

| Event | Cleanup Action |
|---|---|
| Last connection leaves a room | Room entry deleted from `rooms` Map |
| Connection disconnects | Removed from all rooms + org connections |
| Last connection in an org disconnects | Org entry deleted from `orgConnections` |

This prevents memory leaks from abandoned rooms or disconnected clients.
