# Conversations Route Split

## Overview

The monolithic `routes/conversations.ts` has been split into a folder-based structure at `routes/conversations/` following the modular route pattern.

## Folder Structure

```
routes/conversations/
  index.ts        # Composes sub-routes, applies rate limiting, exports conversationsRoute
  schemas.ts      # All Zod request/response schemas for conversation endpoints
  middleware.ts    # Shared middleware configuration (rate limiting)
  queries.ts      # GET endpoints: list, detail, message history
  messaging.ts    # Mutation endpoints: create conversation, send/edit/delete messages
  __tests__/
    queries.test.ts     # 11 tests covering all query endpoints
    messaging.test.ts   # 11 tests covering all messaging endpoints
```

## Sub-Module Responsibilities

### queries.ts
Read-only endpoints with dual-auth (visitor + member):
- `GET /` — list conversations (visitor: scoped by participant; member: scoped by org with role-based visibility)
- `GET /:id` — conversation detail with participants
- `GET /:id/messages` — message history with pagination

### messaging.ts
Mutation endpoints with dual-auth:
- `POST /` — create conversation
- `POST /:id/messages` — send message
- `PATCH /:id/messages/:messageId` — edit message (with WebSocket broadcast)
- `DELETE /:id/messages/:messageId` — soft-delete message (with WebSocket broadcast)

### Lifecycle endpoints (temporary in index.ts)
Member-only endpoints awaiting Phase 3 extraction:
- `POST /:id/accept`, `POST /:id/leave`, `POST /:id/resolve` — state transitions
- `PATCH /:id/subject` — update subject
- `POST /:id/read`, `GET /:id/unread` — read receipts
- `DELETE /:id` — soft-delete conversation (admin-only)

## Middleware Strategy

- **Rate limiting**: applied once in `index.ts` via `.use("*", createUnifiedRateLimitMiddleware())`
- **Auth**: applied per-endpoint via `requireAuth()` in each sub-module, enabling independent testing without the parent router

## Testing Pattern

Each sub-module has a colocated test file that mounts the sub-route directly (e.g., `new Hono().route("/conversations", queriesRoute)`). This allows testing each module in isolation without the rate limiting middleware or other sub-routes. The mock auth middleware is injected via `vi.mock()` at the module level.
