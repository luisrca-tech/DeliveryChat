# System Messages — Widget Rendering

System messages are lifecycle events (accept, leave, resolve) inserted by the backend with `type: "system"` and `senderId: null`. The widget renders them as centered, muted inline text — visually distinct from chat bubbles.

## Type Extraction

The `ChatMessage` type includes a required `type: "text" | "system"` field. Sources:

- **WebSocket `message:new`**: extracts `payload.type`, defaults to `"text"` when missing.
- **WebSocket `messages:sync`**: same extraction per message in the array.
- **REST history fetch** (`getConversationMessages`): maps `m.type` from the API response, defaults to `"text"`.

For system messages, `senderId` arrives as `null` from the backend and is normalized to `""` on the client.

## Rendering

System messages are rendered by `createSystemRow()` in `MessageList.ts`:

- CSS class `message-row-system` (centered flex row)
- Content in a `span.message-system-text` (12px, muted color via `--dc-text-secondary`)
- No bubble, no avatar, no sender name, no timestamp tooltip

## Edit/Delete Guard

System messages never enter the `createBubble()` path, so the action dropdown (copy, edit, delete) is structurally absent — no conditional check needed.
