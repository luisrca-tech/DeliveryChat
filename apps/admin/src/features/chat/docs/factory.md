# Conversation Mutation Factory

## Overview

`buildConversationMutationOptions()` is a factory function that produces TanStack Query mutation options for all conversation mutations. It eliminates the duplicated snapshot/rollback/invalidation boilerplate that previously existed across five separate mutation hooks.

## API

```ts
buildConversationMutationOptions<TVariables, TData>(
  queryClient: QueryClient,
  config: {
    mutationFn: (variables: TVariables) => Promise<TData>;
    optimisticUpdater?: (data: ConversationsListResponse, variables: TVariables) => ConversationsListResponse;
  }
)
```

### With `optimisticUpdater` (accept, leave, resolve)

The factory generates `onMutate`, `onError`, and `onSettled` callbacks that:

1. **onMutate**: Cancel in-flight queries, snapshot all conversation cache entries, apply the optimistic updater via `setQueriesData`
2. **onError**: Roll back to the snapshot
3. **onSettled**: Invalidate all conversation queries to reconcile with server state

### Without `optimisticUpdater` (updateSubject, delete)

The factory generates only an `onSettled` callback that invalidates all conversation queries.

## Files

| File | Purpose |
|---|---|
| `lib/conversationMutationFactory.ts` | Factory function |
| `lib/conversationMutationFactory.test.ts` | Factory tests (snapshot, rollback, invalidation) |
| `lib/conversationsQueryKeys.ts` | Standalone query key definitions (extracted to break import cycles) |
| `hooks/useConversationMutations.ts` | Consumer hooks (5 hooks, each ≤5 lines) |
