# Broadcasting

## Overview

Real-time events are broadcast to WebSocket connections via `broadcastOrganizationEvent` and related helpers in `broadcasting.service.ts`.

## Broadcast placement

Organisation-level and room-level broadcasts for conversation and message lifecycle events are **called inside service functions**, not in route handlers:

| Service function                                    | Broadcast event    | Scope               | When                             |
| --------------------------------------------------- | ------------------ | ------------------- | -------------------------------- |
| `createConversation`                                | `conversation:new` | Organization        | After the DB transaction commits |
| `sendMessage` (when `broadcastContext` is provided) | `message:new`      | Organization + Room | After the DB transaction commits |

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

## Known Risks

### Dual broadcast produces duplicate events for staff in rooms

`sendMessage()` broadcasts `message:new` to both the organization and the conversation room. Staff members who joined a conversation room via `room:join` receive the event twice — once per broadcast scope. Both the widget and admin clients already deduplicate by `msg.id`, so this is functionally safe. The trade-off is doubled serialization and network cost per message for those connections. If this becomes a performance concern, `broadcastRoomEvent` could filter out non-visitor connections and rely on the org broadcast for staff delivery.

### Independent try/catch means partial broadcast is possible

The org and room broadcasts in `sendMessage()` use separate `try/catch` blocks. If the org broadcast succeeds but the room broadcast fails (or vice versa), some participants see the message in real-time and others don't. The HTTP response still succeeds in both cases, so the message is persisted — affected clients will see it on next poll or reconnect. This is acceptable for an in-memory broadcast layer but would need rethinking if broadcast failures become common.

### Edit/delete broadcasts are in route handlers, not the service layer

Unlike `sendMessage()` (service-level broadcast), `editMessage` and `deleteMessage` broadcasts (`message:edited`, `message:deleted`) are called from the route handler in `conversations.ts`. This means the service layer is not self-contained for edit/delete broadcasts — a future caller of `editMessage()` from a different route or service would need to add its own broadcast. Phase 6 may consolidate this.
