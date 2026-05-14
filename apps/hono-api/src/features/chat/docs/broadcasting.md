# Broadcasting

## Overview

Real-time events are broadcast to WebSocket connections via `broadcastOrganizationEvent` and related helpers in `broadcasting.service.ts`.

## Broadcast placement

Organisation-level and room-level broadcasts for conversation and message lifecycle events are **called inside service functions**, not in route handlers:

| Service function | Broadcast event | Scope | When |
|---|---|---|---|
| `createConversation` | `conversation:new` | Organization | After the DB transaction commits |
| `sendMessage` (when `broadcastContext` is provided) | `message:new` | Organization + Room | After the DB transaction commits |

Route handlers call the service and return the HTTP response. They do not call broadcast functions directly (except `editMessage` and `deleteMessage` which broadcast `message:edited`/`message:deleted` to the room from the route handler).

## Broadcast errors are non-fatal

Both `createConversation` and `sendMessage` wrap their broadcast call in `try/catch`. A broadcast failure is logged to `console.error` but does **not** throw and does **not** roll back the DB write. The HTTP response is still returned normally.

## Conditional broadcast in `sendMessage`

`sendMessage` only broadcasts when the caller passes a `broadcastContext`:

```typescript
await sendMessage({
  conversationId,
  senderId,
  content,
  broadcastContext: { senderName: "Visitor", senderRole: "visitor" },
});
```

When `broadcastContext` is provided, `sendMessage` broadcasts the same `message:new` event to **both** the organization (so staff see it in conversation lists) and the conversation room (so visitors and joined participants see it). Clients handle deduplication — the widget checks `msg.id` before appending.

The WebSocket message handler (`chat.handlers.ts`) calls `sendMessage` without `broadcastContext` and handles its own per-room and staff broadcasts via `roomManager` directly. This prevents double-broadcasting for WS-sent messages.

## Broadcast helpers

All event factories (`buildConversationNewEvent`, `buildMessageNewEvent`, etc.) and broadcast wrappers (`broadcastOrganizationEvent`, `broadcastRoomEvent`, `broadcastStaffEvent`) live in `broadcasting.service.ts`.
