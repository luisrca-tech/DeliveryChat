import type { QueryClient } from "@tanstack/react-query";
import { conversationsQueryKeys } from "./conversationsQueryKeys";
import type { ConversationsListResponse } from "../types/chat.types";

type QueryCacheSnapshot = [readonly unknown[], ConversationsListResponse | undefined][];

interface ConversationMutationConfig<TVariables, TData> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  optimisticUpdater?: (
    data: ConversationsListResponse,
    variables: TVariables,
  ) => ConversationsListResponse;
}

export function buildConversationMutationOptions<TVariables, TData = unknown>(
  queryClient: QueryClient,
  config: ConversationMutationConfig<TVariables, TData>,
) {
  const queryKey = conversationsQueryKeys.all();

  const base = {
    mutationFn: config.mutationFn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };

  if (!config.optimisticUpdater) return base;

  const updater = config.optimisticUpdater;

  const listPredicate = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[1] === "list";

  return {
    ...base,
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey });

      const snapshot: QueryCacheSnapshot =
        queryClient.getQueriesData<ConversationsListResponse>({
          queryKey,
          predicate: listPredicate,
        });

      queryClient.setQueriesData<ConversationsListResponse>(
        { queryKey, predicate: listPredicate },
        (old) => (old ? updater(old, variables) : old),
      );

      return { snapshot };
    },
    onError: (
      _err: Error,
      _vars: TVariables,
      context: { snapshot: QueryCacheSnapshot } | undefined,
    ) => {
      if (!context?.snapshot) return;
      for (const [key, data] of context.snapshot) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}
