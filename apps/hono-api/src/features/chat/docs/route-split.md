# Conversations Route Split

## Overview

The monolithic `routes/conversations.ts` has been fully split into a folder-based structure at `routes/conversations/`. The old monolith file has been deleted.

## Folder Structure

```
routes/conversations/
  index.ts          # Composes all 4 sub-routes, applies rate limiting, exports conversationsRoute
  schemas.ts        # All Zod request/response schemas for conversation endpoints
  middleware.ts     # Shared middleware configuration (rate limiting)
  queries.ts        # GET endpoints: list, detail, message history
  messaging.ts      # Mutation endpoints: create conversation, send/edit/delete messages
  lifecycle.ts      # Member-only state transitions: accept, leave, resolve, subject, delete
  readReceipts.ts   # Read receipt endpoints: mark as read, unread count
  __tests__/
    queries.test.ts       # 11 tests covering all query endpoints
    messaging.test.ts     # 11 tests covering all messaging endpoints
    lifecycle.test.ts     # 15 tests covering all lifecycle endpoints
    readReceipts.test.ts  # 10 tests covering read receipt endpoints
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

### lifecycle.ts

Member-only endpoints for conversation state transitions:

- `POST /:id/accept` — accept conversation (operator takes ownership, auto-adds as participant)
- `POST /:id/leave` — release conversation back to pending queue
- `POST /:id/resolve` — mark conversation as closed
- `PATCH /:id/subject` — update conversation subject
- `DELETE /:id` — soft-delete conversation (admin/super_admin only)

### readReceipts.ts

Dual-auth endpoints for tracking read state:

- `POST /:id/read` — mark conversation as read up to a specific message
- `GET /:id/unread` — get unread message count for current user

Both endpoints verify the caller is a participant before operating. Visitors are checked via `isParticipant()`; members are checked the same way.

## Middleware Strategy

- **Rate limiting**: applied once in `index.ts` via `.use("*", createUnifiedRateLimitMiddleware())`
- **Auth**: applied per-endpoint via `requireAuth()` in each sub-module, enabling independent testing without the parent router
- **Billing**: applied per-endpoint via `checkBillingStatus()` only on lifecycle mutation endpoints

## Testing Pattern

Each sub-module has a colocated test file that mounts the sub-route directly (e.g., `new Hono().route("/conversations", lifecycleRoute)`). This allows testing each module in isolation without the rate limiting middleware or other sub-routes. The mock auth middleware is injected via `vi.mock()` at the module level.
