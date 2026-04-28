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

  return {
    ...base,
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey });

      const snapshot: QueryCacheSnapshot =
        queryClient.getQueriesData<ConversationsListResponse>({ queryKey });

      queryClient.setQueriesData<ConversationsListResponse>(
        { queryKey },
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
