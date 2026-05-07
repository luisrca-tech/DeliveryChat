# Public REST API — Backend Implementation

## Overview

The public REST API exposes chat functionality to third-party integrators via standard HTTP endpoints at `/v1/api/`. It mirrors the widget's capabilities but decouples them from the embedded widget, allowing any client to create conversations, send messages, and manage read state.

## Route Registration

Registered in `src/lib/api.ts` as `.route("/api", publicApiRoute)`. All routes share the `/v1/api/` prefix.

## Authentication & Middleware Chain

All endpoints are guarded by three middleware layers applied in order:

1. **`requireApiKeyAuth()`** — Validates `Authorization: Bearer dk_(live|test)_[32chars]` + `X-App-Id` header. Returns 401 on failure. Sets `apiAuth` context with the resolved application and organization.

2. **Visitor resolution middleware** — Requires `X-Visitor-Id` header (client-generated UUID). Returns 400 if missing or invalid. Creates an anonymous user on first contact as `{visitorId}@anonymous.deliverychat.online`. Sets `visitor` context with `visitorId` and `visitorUserId`.

3. **`createVisitorRateLimitMiddleware()`** — Per-visitor rate limiting with three sliding windows (per-second, per-minute, per-hour). Rate limit key is `visitor:{appId}:{visitorId}` when both headers are present, or falls back to IP-based keying. Returns 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

## Endpoints

### POST /ws-token

Signs a WebSocket connection token using `signWsToken()`. The token encodes `appId`, `origin`, and `visitorId` for subsequent WebSocket authentication.

### POST /conversations

Creates a new conversation scoped to the application and organization. The visitor is added as the first participant. Broadcasts `conversation:new` to the organization's WebSocket room so operators see it in real-time.

### GET /conversations

Lists conversations where the visitor is an active participant, scoped to the application. Supports offset-based pagination via `limit` (default 20, max 100) and `offset` (default 0) query parameters. Returns `total` count for pagination UI.

### GET /conversations/:id

Returns a single conversation with its participant list. Returns 404 if the conversation doesn't exist or the visitor is not a participant (no information leakage).

### GET /conversations/:id/messages

Returns paginated message history for a conversation. Excludes soft-deleted messages. Requires the visitor to be a participant.

### POST /conversations/:id/messages

Sends a message to a conversation. The conversation must be in `pending` or `active` status. After persisting via `sendMessage()`, broadcasts `message:new` to the organization's WebSocket room so connected staff clients see the message in real-time. Returns 422 if the conversation is closed.

### PATCH /conversations/:id/messages/:messageId

Edits a message. Subject to sender ownership check and the 15-minute edit window (see `message-edit-delete.md`). Returns 422 with `edit_window_expired` error code if the window has passed.

### DELETE /conversations/:id/messages/:messageId

Soft-deletes a message. Same ownership and time window constraints as edit. Returns 422 with `edit_window_expired` error code if the window has passed.

### POST /conversations/:id/read

Marks the conversation as read up to a given `messageId` for the visitor. Updates the `lastReadMessageId` on the visitor's participant record.

### GET /conversations/:id/unread

Returns the count of unread staff-sent messages since the visitor's last read position.

## Response Envelope

All responses use a consistent JSON envelope:

- **Success**: `{ conversation: {...} }`, `{ messages: [...], limit, offset }`, `{ message: {...} }`, `{ token: "..." }`, `{ success: true }`, `{ unreadCount: N }`
- **Error**: `{ error: "error_code", message: "Human-readable description" }` via `jsonError()`
- **Rate limited**: `{ error: "Rate limit exceeded", cause: "per_visitor", retryAfter: N, window: "second"|"minute"|"hour" }`

## Pagination

Offset-based pagination with `limit` + `offset` query parameters. List endpoints return a `total` field for building pagination UI. Maximum `limit` is 100.

## Rate Limiting

The visitor rate limiter applies three sliding windows configured via `VISITOR_RATE_LIMITS` in `planLimits.ts`. On 429 responses, the following headers are included:

| Header | Value |
|--------|-------|
| `Retry-After` | Seconds until the client should retry |
| `X-RateLimit-Limit` | Maximum requests allowed in the violated window |
| `X-RateLimit-Remaining` | Always `0` on a 429 |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |

## WebSocket Integration

Two endpoints broadcast to WebSocket rooms after persisting data:

- `POST /conversations` → broadcasts `conversation:new` to the organization room
- `POST /conversations/:id/messages` → broadcasts `message:new` to the organization room

This ensures operators using the admin dashboard see new conversations and messages in real-time, even when the visitor is using the REST API instead of the WebSocket protocol.

## Service Layer Reuse

All route handlers delegate to existing functions in `chat.service.ts`. No business logic is duplicated — the REST API is a thin HTTP transport layer over the same service functions used by the WebSocket handlers.
