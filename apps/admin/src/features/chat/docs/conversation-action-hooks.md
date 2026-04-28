# Conversation Action Hooks

Dedicated hooks that encapsulate the full side-effect chain for conversation lifecycle actions — mutation, navigation, toast, and error handling — so components call a single `execute(conversationId)` instead of duplicating try/catch blocks.

## Hooks

### `useAcceptAction(currentUserRole, setActiveRoom)`

Accepts a pending conversation and joins the WebSocket room.

Side effects on success:
1. Fires `acceptMutation.mutateAsync(conversationId)` (with optimistic update)
2. Navigates to "mine" (operator) or "all" (admin) filter
3. Shows success toast
4. Calls `setActiveRoom(conversationId, undefined, true)` to join the WS room

On `ConversationConflictError` (409): shows "Already taken by another operator" toast.
On other errors: shows generic failure toast.

### `useLeaveAction()`

Leaves an active conversation, returning it to the queue.

Side effects on success:
1. Fires `leaveMutation.mutateAsync(conversationId)` (with optimistic update)
2. Navigates to "queue" filter
3. Shows success toast

### `useResolveAction()`

Resolves an active conversation, marking it as closed.

Side effects on success:
1. Fires `resolveMutation.mutateAsync(conversationId)` (with optimistic update)
2. Navigates to "closed" filter
3. Shows success toast

## Return Shape

Each hook returns:

```ts
{
  execute: (conversationId: string) => Promise<boolean>;
  isPending: boolean;
}
```

`execute` returns `true` on success, `false` on handled error. Components use this to manage local UI state (e.g. closing confirmation dialogs only on success).

## Usage

```tsx
// ChatPanel — accept
const acceptAction = useAcceptAction(currentUserRole, ws.setActiveRoom);
<Button onClick={() => acceptAction.execute(conversationId)} disabled={acceptAction.isPending}>

// ChatHeader — leave / resolve
const leaveAction = useLeaveAction();
const resolveAction = useResolveAction();

const handleLeave = async () => {
  const ok = await leaveAction.execute(conversation.id);
  if (ok) setIsLeaveDialogOpen(false);
};
```

## Design Decisions

- **Navigation and auth accessed internally**: hooks call `useNavigate`, `Route.useSearch`, and `authClient.useSession` themselves rather than receiving them as props, reducing parameter surface.
- **Dialog state stays in components**: confirmation dialog open/close is local UI state that belongs in the component, not the action hook. The `boolean` return from `execute` bridges the two cleanly.
- **WebSocket room join only on accept**: only `useAcceptAction` receives `setActiveRoom` because leave and resolve don't require room management — the operator is leaving the conversation.
