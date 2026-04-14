# Unread Messages

## Summary

Per-operator unread visitor message counting with real-time badges and toast notifications in the admin chat.

## Key Points

- Counts only **visitor-sent** messages (not operator/admin)
- Tracked per participant via `conversationParticipants.lastReadMessageId`
- `lastReadMessageId` advances **monotonically** (never backwards)
- No new DB columns — uses existing `lastReadMessageId`

## API

| Endpoint | Description |
|---|---|
| `GET /v1/conversations` | Now includes `unreadCount` per conversation |
| `POST /v1/conversations/:id/read` | Marks conversation as read for current user |

## Service Functions

| Function | File |
|---|---|
| `getUnreadCount(conversationId, userId)` | `chat.service.ts` |
| `markAsRead(conversationId, userId, messageId)` | `chat.service.ts` |

## Admin Frontend

- Badge on `ConversationListItem` (blue, capped at 99+)
- Optimistic cache reset on conversation select
- WebSocket-driven increment on visitor `message:new`
- Clickable toast notification navigating to conversation

## Widget (Visitor-Facing)

| Endpoint | Description |
|---|---|
| `GET /v1/widget/conversations/:id/unread` | Returns `{ unreadCount }` for the visitor |
| `POST /v1/widget/conversations/:id/read` | Marks conversation as read for visitor |

| Function | File |
|---|---|
| `getUnreadCountForVisitor(conversationId, visitorUserId)` | `chat.service.ts` |

- Red badge on launcher button (capped at 99+, `aria-live="polite"`)
- WS-driven increment when chat is closed
- Resets on open, new chat, or destroy
- Fetches initial count from API on page load (persists across refresh)

## Detailed Docs

See `apps/hono-api/src/features/chat/docs/unread-messages.md` for full technical documentation.
