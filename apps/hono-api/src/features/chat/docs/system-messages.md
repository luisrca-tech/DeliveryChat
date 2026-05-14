# System Messages

System messages are automated, immutable records inserted into conversation history when lifecycle events occur. They provide audit trail and user-facing notifications for conversation state changes.

## Events That Generate System Messages

| Event | Content Format | Trigger |
|-------|---------------|---------|
| Accept | `"{operatorName} joined the conversation"` | `POST /conversations/:id/accept` |
| Leave | `"{operatorName} left the conversation. You'll be placed back in the queue shortly."` | `POST /conversations/:id/leave` |
| Resolve | `"{operatorName} resolved the conversation"` | `POST /conversations/:id/resolve` |

## Storage

System messages use the existing `messages` table with:

- `type: "system"` (from `messageTypeEnum`)
- `senderId: null` (no human sender)
- `content`: plain English text with operator name baked in

The `senderId` column was made nullable to support this.

## Broadcast

System messages flow through the existing `message:new` WebSocket event via `buildMessageNewEvent`. No new event types were introduced. The broadcast payload uses:

- `senderId: null`
- `senderName: ""`
- `senderRole: "operator"` (contextual, not meaningful for system messages)
- `type: "system"`

## Service-Layer Orchestration

All broadcasting (both lifecycle events and system messages) is handled inside the service functions (`acceptConversation`, `leaveConversation`, `resolveConversation`), not in the route layer. This follows the same pattern as `createConversation`, which already broadcasts from the service. Routes are thin — they call the service and return the response.

The private `broadcastSystemMessage` helper in `chat.service.ts` encapsulates the create-insert-broadcast cycle, eliminating the duplication that previously existed across three route handlers.

## Failure Isolation

System message creation and broadcasting are separate operations from the status update. If either fails, the lifecycle event still succeeds. Errors are logged but not propagated to the client.

## Immutability

System messages cannot be edited or deleted. The `editMessage` and `deleteMessage` service functions require `senderId` matching, which naturally excludes system messages (null senderId).

## AuthContext Enhancement

`AuthContext.user` was extended to include `name: string` (previously only `id`). The middleware already fetched `user.name` from the database but discarded it in the type. This change also fixed the `assignedToName` field in `conversation:accepted` broadcasts, which was hardcoded as `""`.
