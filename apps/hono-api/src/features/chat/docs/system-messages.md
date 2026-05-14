# System Messages

System messages are automated, immutable records inserted into conversation history when lifecycle events occur. They provide audit trail and user-facing notifications for conversation state changes.

## Events That Generate System Messages

| Event | Content Format | Trigger |
|-------|---------------|---------|
| Accept | `"{operatorName} joined the conversation"` | `POST /conversations/:id/accept` |
| Leave | `"{operatorName} left the conversation"` | `POST /conversations/:id/leave` |
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

## Failure Isolation

System message creation is a separate operation from the status update. If the system message insert or broadcast fails, the lifecycle event still succeeds. Errors are logged but not propagated to the client.

## Immutability

System messages cannot be edited or deleted. The `editMessage` and `deleteMessage` service functions require `senderId` matching, which naturally excludes system messages (null senderId).

## AuthContext Enhancement

`AuthContext.user` was extended to include `name: string` (previously only `id`). The middleware already fetched `user.name` from the database but discarded it in the type. This change also fixed the `assignedToName` field in `conversation:accepted` broadcasts, which was hardcoded as `""`.
