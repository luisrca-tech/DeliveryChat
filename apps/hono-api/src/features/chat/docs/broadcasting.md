# Broadcasting

## Overview

Real-time events are broadcast to WebSocket connections via `broadcastOrganizationEvent` and related helpers in `broadcasting.service.ts`.

## Broadcast placement

Organisation-level broadcasts for conversation and message lifecycle events are **called inside service functions**, not in route handlers:

| Service function | Broadcast event | When |
|---|---|---|
| `createConversation` | `conversation:new` | After the DB transaction commits |
| `sendMessage` (when `broadcastContext` is provided) | `message:new` | After the DB transaction commits |

Route handlers (`publicApi.ts`, `widget.ts`) call the service and return the HTTP response. They do not call `broadcastOrganizationEvent` directly.

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

The WebSocket message handler (`chat.handlers.ts`) calls `sendMessage` without `broadcastContext` and handles its own per-room and staff broadcasts via `roomManager` directly. This prevents double-broadcasting for WS-sent messages.

## Broadcast helpers

All event factories (`buildConversationNewEvent`, `buildMessageNewEvent`, etc.) and broadcast wrappers (`broadcastOrganizationEvent`, `broadcastRoomEvent`, `broadcastStaffEvent`) live in `broadcasting.service.ts`.
