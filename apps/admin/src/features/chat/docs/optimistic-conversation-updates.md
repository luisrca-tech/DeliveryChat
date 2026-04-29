# Optimistic Conversation Updates

## Overview

Conversation mutations (accept, leave, resolve) use TanStack Query's optimistic update pattern to provide instant UI feedback. When an operator clicks an action button, the conversation list updates immediately without waiting for the server response.

## Pattern

Each mutation implements three callbacks:

- **`onMutate`**: Cancels in-flight queries, snapshots all conversation cache entries, then writes the optimistic state via `setQueriesData`.
- **`onError`**: Restores the cache snapshot, rolling back to the previous state.
- **`onSettled`**: Invalidates all conversation queries so the server-reconciled state replaces the optimistic state.

## Optimistic State Changes

| Action  | `status`  | `assignedTo`    |
|---------|-----------|-----------------|
| Accept  | `active`  | `currentUserId` |
| Leave   | `pending` | `null`          |
| Resolve | `closed`  | _(unchanged)_   |

## Architecture

The cache transformation logic lives in `lib/optimisticConversationUpdates.ts` as pure functions, keeping the mutation hooks thin and the business logic independently testable.

```
optimisticConversationUpdates.ts   ← pure transform functions (tested)
useConversationMutations.ts        ← hooks wiring onMutate/onError/onSettled
```

## Hook Signature Change

`useAcceptConversationMutation` now requires `currentUserId: string` so the optimistic update can set `assignedTo` without a server round-trip.

```ts
// Before
const acceptMutation = useAcceptConversationMutation();

// After
const acceptMutation = useAcceptConversationMutation(currentUserId);
```

`useLeaveConversationMutation` and `useResolveConversationMutation` signatures are unchanged.
