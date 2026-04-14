# Unread Messages

## Overview

Per-operator unread message counting for admin chat conversations. Operators and admins see how many unread visitor messages exist in each conversation, with real-time badge updates and toast notifications.

## Business Rules

1. **Visitor-only counting** — only messages sent by participants with role `visitor` count toward unread. Operator/admin messages are never counted.
2. **Per-participant tracking** — each operator/admin has their own independent read position via `conversationParticipants.lastReadMessageId`.
3. **Monotonic advancement** — `lastReadMessageId` only moves forward (newer messages). It never regresses to an older message.
4. **Auto-mark on open** — when an operator opens a conversation, the frontend calls `POST /conversations/:id/read` to advance `lastReadMessageId` to the latest message.
6. **Auto-read while focused** — if the user is already viewing a conversation and a new visitor message arrives, `markAsRead` is called automatically before refreshing the list, ensuring the count stays at 0.
5. **Soft-delete awareness** — deleted messages (`deletedAt IS NOT NULL`) are excluded from unread counts.

## Database

No new columns or migrations. Uses the existing `lastReadMessageId` column on `delivery_chat_conversation_participants`.

## Service Functions

### `getUnreadCount(conversationId, userId): Promise<number>`

Counts visitor-sent, non-deleted messages after the participant's `lastReadMessageId`. If `lastReadMessageId` is null, all visitor messages are unread.

Uses `innerJoin` with `conversationParticipants` to resolve sender role (same pattern as `GET /:id/messages`).

### `markAsRead(conversationId, userId, messageId): Promise<{ lastReadMessageId } | null>`

Updates `lastReadMessageId` for the participant. Enforces monotonic advance by comparing `createdAt` timestamps of current vs new message. Returns null if user is not a participant or if the new message is older.

## API Endpoints

### `GET /v1/conversations`

Extended response — each conversation now includes `unreadCount: number` for the authenticated user.

### `POST /v1/conversations/:id/read`

Marks the conversation as read for the authenticated user by setting `lastReadMessageId` to the latest non-deleted message. Returns `{ success: true }`.

## Admin Frontend Behavior

- **Badge** — blue count badge on the `MessageSquare` icon in `ConversationListItem` when `unreadCount > 0`. Capped at `99+`.
- **Optimistic reset** — selecting a conversation immediately zeroes the badge in the TanStack Query cache before the API responds.
- **WebSocket increment** — on `message:new` from a visitor, the unread count for that conversation is incremented in cache (unless the conversation is currently open).
- **Toast notification** — visitor messages on non-open conversations trigger a toast with a clickable "Open" button that navigates to the conversation.

## Widget (Visitor-Facing)

### Service Function

#### `getUnreadCountForVisitor(conversationId, visitorUserId): Promise<number>`

Counts non-deleted messages where `senderId != visitorUserId` (operator/admin messages) after the visitor's `lastReadMessageId`. Uses `ne(messages.senderId, visitorUserId)` instead of a role join — simpler since there's only one visitor per conversation.

### Widget API Endpoints

#### `GET /v1/widget/conversations/:id/unread`

Returns `{ unreadCount: number }` for the visitor. Requires `requireWidgetAuth()` + `X-Visitor-Id` header. Verifies conversation belongs to the application.

#### `POST /v1/widget/conversations/:id/read`

Marks conversation as read for the visitor by setting `lastReadMessageId` to the latest non-deleted message. Returns `{ success: true }`.

### Widget Frontend Behavior

- **Badge** — red pill badge on the launcher button when `unreadCount > 0`. Capped at `99+`. Uses `aria-live="polite"` for accessibility.
- **WS increment** — on `message:new` from a non-visitor sender while the chat is closed, `unreadCount` increments in state.
- **Reset on open** — clicking the launcher zeroes the badge and fires `markConversationAsRead` (fire-and-forget).
- **Restore on page load** — when a persisted conversation exists, fetches unread count from `GET .../unread` endpoint.
- **Reset on new/destroy** — starting a new chat or destroying the widget zeroes the badge.
