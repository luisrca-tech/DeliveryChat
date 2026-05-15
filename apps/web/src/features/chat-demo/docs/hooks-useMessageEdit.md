# useMessageEdit

## Responsibility

Owns the inline edit and delete flow for visitor-owned messages. Enforces the 15-minute edit window: messages older than 15 minutes silently cancel the save rather than hitting the API.

## Owned state

- `editingState: { id: string; content: string; saving: boolean } | null` — null when no message is being edited.

## Exposed API

```ts
function useMessageEdit(
  client: ChatClient,
  onReplace: (id: string, content: string, editedAt: string) => void,
  onRemove: (id: string) => void,
): {
  editingState: EditingState;
  handleStartEdit(msg: OptimisticMessage): void;
  handleCancelEdit(): void;
  setEditingContent(content: string): void;
  handleSaveEdit(msg: OptimisticMessage): Promise<void>;
  handleDelete(msg: OptimisticMessage): Promise<void>;
};
```

- `onReplace` / `onRemove` — callbacks into the message list (owned by the caller, later by `useMessageHistory`).
- `handleSaveEdit` — no-ops silently if outside the edit window; keep-open on API error so the user can retry.
- `handleDelete` — swallows errors so the message stays visible rather than disappearing unexpectedly.

## Edit window invariant

```
Date.now() - new Date(msg.createdAt).getTime() < 15 * 60 * 1000
```

This check runs at save time, not at start-edit time, since a user could start editing and wait.

## Test strategy

- Window boundary: verifies save is blocked when `createdAt` is `EDIT_WINDOW_MS + 1ms` in the past, and allowed when within `EDIT_WINDOW_MS - 5s`.
- Delete: verifies `onRemove` is called on success.
- Callbacks receive the updated content and `editedAt` from the API response.
