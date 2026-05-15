# Message Edit & Delete -- Widget UX

## Bubble States

Each message bubble renders differently depending on its state:

| State | Condition | Rendering |
|---|---|---|
| **Normal** | `editedAt` is null, `deletedAt` is null | Standard bubble with message content |
| **Edited** | `editedAt` is set, `deletedAt` is null | Message content + "(edited)" label in muted text below content |
| **Deleted** | `deletedAt` is set | Gray italic placeholder: "This message was deleted". No content shown. |
| **Editing** | `editingMessageId === msg.id` | Inline textarea replaces content, with Save and Cancel buttons |

## Action Menu

The action menu shows edit and delete icons for messages sent by the current user.

### Trigger behavior

- **Desktop:** CSS `:hover` on the message bubble reveals the action icons. The menu fades in/out with a short transition.
- **Mobile:** Long-press (touch-and-hold) on the message bubble triggers the menu. A `touchstart`/`touchend` timer (300ms threshold) controls activation.

### Positioning

The action menu is positioned absolutely above the message bubble, aligned to the right edge (for sent messages). It sits outside the normal document flow to avoid shifting the message layout.

### Visibility rules

Actions are hidden when:
- The message was sent by another user
- The message has `type: "system"`
- The message is in a pending/failed state (no `serverMessageId`)
- The conversation status is `closed`
- The message is already deleted

## CSS Classes

| Class | Element | Purpose |
|---|---|---|
| `.message-actions` | Container div | Wraps edit/delete icon buttons, shown on hover/long-press |
| `.message-editing` | Bubble wrapper | Applied to the bubble when in edit mode, adjusts padding for textarea |
| `.message-deleted` | Bubble wrapper | Applied to deleted message placeholders, gray/italic styling |
| `.edit-container` | Inner div | Contains the textarea, Save button, and Cancel button during editing |
| `.delete-confirm` | Modal/overlay | Confirmation dialog before deleting a message |

## State Management

### `editingMessageId`

A single piece of state (`editingMessageId: string | null`) drives enter/exit of edit mode:

- **Enter edit mode:** User clicks the edit icon. `editingMessageId` is set to the message ID. The bubble transitions from Normal to Editing state.
- **Exit edit mode:** User clicks Save or Cancel. `editingMessageId` is set to `null`. The bubble returns to Normal (or Edited if saved).
- **Single edit at a time:** Only one message can be in edit mode. Setting `editingMessageId` to a new ID automatically exits the previous edit.

### Edit textarea

The textarea is pre-filled with the current message content. It auto-focuses on mount and supports:
- **Enter** to save (without Shift)
- **Shift+Enter** for newline
- **Escape** to cancel

## Optimistic Updates

### Edit flow

1. User modifies content and clicks Save.
2. Local message state is updated immediately with the new content and a provisional `editedAt`.
3. `message:edit` WebSocket event is sent to the server.
4. Server broadcasts `message:edited` to all room participants (including sender).
5. On receipt, the local state is reconciled with the server-confirmed `editedAt` timestamp.

### Delete flow

1. User clicks delete icon. Confirmation dialog appears.
2. User confirms. Local message state is updated to show the deleted placeholder.
3. `message:delete` WebSocket event is sent to the server.
4. Server broadcasts `message:deleted` to all room participants.
5. On receipt, the deletion is confirmed in local state.

### Error recovery

If the WebSocket event fails (connection lost, server error), the optimistic update is reverted:
- Edited messages revert to their previous content.
- Deleted messages reappear with their original content.

The user sees a transient error toast indicating the action could not be completed.
