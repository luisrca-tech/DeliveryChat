# WebSocket Architecture Overview

## Technology Stack

| Layer            | Technology                            | Purpose                                       |
| ---------------- | ------------------------------------- | --------------------------------------------- |
| Server framework | Hono v4                               | Lightweight HTTP + WebSocket server           |
| WS adapter       | `@hono/node-ws`                       | Node.js WebSocket support for Hono            |
| Database         | PostgreSQL + Drizzle ORM              | Message persistence, conversation state       |
| Auth             | Better Auth                           | Session + anonymous user authentication       |
| Shared types     | `@repo/types` (`ws-events.ts`)        | TypeScript event contracts shared across apps |
| Admin client     | Native `WebSocket` API + React hooks  | TanStack Query integration                    |
| Widget client    | Native `WebSocket` API + custom state | Vanilla subscription-based state              |

## High-Level Architecture

```
                     ┌─────────────────────────────────┐
                     │         HONO API SERVER          │
                     │         (apps/hono-api)          │
                     │                                  │
                     │  ┌──────────┐  ┌──────────────┐ │
  Widget Visitor ←──WS──→ WS Route │  │  REST Routes │←── Admin Dashboard
  (apps/widget)      │  │ /v1/ws   │  │ /v1/conv...  │   (apps/admin)
                     │  └────┬─────┘  └──────┬───────┘ │
                     │       │               │         │
                     │       ▼               ▼         │
                     │  ┌────────────────────────────┐ │
                     │  │     InMemoryRoomManager     │ │
                     │  │  ┌──────┐ ┌─────┐ ┌─────┐  │ │
                     │  │  │Rooms │ │Users│ │ Org │  │ │
                     │  │  └──────┘ └─────┘ └─────┘  │ │
                     │  └────────────────────────────┘ │
                     │              │                   │
                     │              ▼                   │
                     │  ┌────────────────────────────┐ │
                     │  │   PostgreSQL (Drizzle ORM)  │ │
                     │  │  conversations | messages   │ │
                     │  │  participants  | users      │ │
                     │  └────────────────────────────┘ │
                     └─────────────────────────────────┘
```

## Connection Lifecycle

```
Client                           Server
  │                                │
  ├── GET /v1/ws (upgrade) ───────►│
  │                                ├── authenticateWebSocket()
  │                                │   ├── Widget? → validate appId + origin
  │                                │   └── Session? → validate token + org membership
  │                                │
  │◄── connection established ─────┤
  │                                ├── registerConnection(orgId)
  │                                │
  ├── { type: "room:join" } ──────►├── verify participant → join room
  │◄── { type: "messages:sync" } ──┤   (sends missed messages if lastMessageId)
  │                                │
  ├── { type: "message:send" } ───►├── validate auth → save to DB
  │◄── { type: "message:ack" } ────┤   → broadcast message:new to room
  │                                │
  ├── { type: "ping" } ───────────►│
  │◄── { type: "pong" } ──────────┤
  │                                │
  ├── close ──────────────────────►├── leave all rooms
  │                                ├── unregisterConnection(orgId)
  │                                └── cleanup empty rooms
```

## Dual Broadcast Channels

The system uses two broadcast scopes to balance targeted messaging with organization-wide awareness:

### Room Broadcasts (conversation-scoped)

Messages that only matter to participants currently viewing a conversation:

- `message:new` — new message in the conversation
- `message:ack` — delivery confirmation to sender
- `messages:sync` — catch-up messages on reconnect
- `typing:start` / `typing:stop` — real-time typing indicators

### Organization Broadcasts (org-wide)

Queue and lifecycle events that affect all staff members:

- `conversation:new` — a visitor started a new conversation
- `conversation:accepted` — an operator claimed a conversation
- `conversation:released` — an operator released a conversation back to the queue
- `conversation:resolved` — a conversation was marked as solved

## Hybrid REST + WebSocket Design

REST and WebSocket serve complementary roles:

| Concern                | REST API                                               | WebSocket                               |
| ---------------------- | ------------------------------------------------------ | --------------------------------------- |
| Data persistence       | Creates/updates DB records                             | Does not write lifecycle state          |
| Real-time delivery     | Not real-time                                          | Broadcasts events immediately           |
| Conversation lifecycle | `POST /conversations/:id/accept`, `/leave`, `/resolve` | Broadcasts the resulting event          |
| Message sending        | Not used for messages                                  | `message:send` → persist → broadcast    |
| Reliability            | Request/response guarantees                            | Best-effort broadcast (fire-and-forget) |

REST endpoints handle persistence and then trigger WebSocket broadcasts via the shared `roomManager` instance. This decouples persistence from real-time delivery — if a WebSocket connection is temporarily down, the data is still safely in the database and will sync on reconnect via `messages:sync`.

## Key Source Files

| File               | Path                                                 | Purpose                                    |
| ------------------ | ---------------------------------------------------- | ------------------------------------------ |
| WS init            | `apps/hono-api/src/lib/ws.ts`                        | Creates `@hono/node-ws` instance           |
| WS route           | `apps/hono-api/src/routes/ws.ts`                     | Connection lifecycle, auth, event dispatch |
| WS auth            | `apps/hono-api/src/lib/middleware/wsAuth.ts`         | Dual authentication middleware             |
| Room manager       | `apps/hono-api/src/features/chat/room-manager.ts`    | In-memory room/connection tracking         |
| Event handlers     | `apps/hono-api/src/features/chat/chat.handlers.ts`   | Server-side event processing               |
| Chat service       | `apps/hono-api/src/features/chat/chat.service.ts`    | Business logic (DB queries)                |
| Validation schemas | `apps/hono-api/src/features/chat/chat.schemas.ts`    | Zod schemas for event payloads             |
| Shared types       | `packages/types/src/ws-events.ts`                    | TypeScript event contracts                 |
| Admin WS client    | `apps/admin/src/features/chat/lib/ws.client.ts`      | WebSocketManager class                     |
| Admin WS hook      | `apps/admin/src/features/chat/hooks/useWebSocket.ts` | React hook integration                     |
| Widget WS client   | `apps/widget/src/widget/ws.ts`                       | Standalone WebSocket client                |
| Widget state       | `apps/widget/src/widget/state.ts`                    | Subscription-based state management        |
