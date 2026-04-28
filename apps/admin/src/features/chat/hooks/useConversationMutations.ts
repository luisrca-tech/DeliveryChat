import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  acceptConversation,
  leaveConversation,
  resolveConversation,
  deleteConversation,
  updateConversationSubject,
} from "../lib/conversations.client";
import { conversationsQueryKeys } from "./useConversationsQuery";
import {
  applyOptimisticAccept,
  applyOptimisticLeave,
  applyOptimisticResolve,
} from "../lib/optimisticConversationUpdates";
import type { ConversationsListResponse } from "../types/chat.types";

type QueryCacheSnapshot = [readonly unknown[], ConversationsListResponse | undefined][];

function snapshotListQueries(queryClient: ReturnType<typeof useQueryClient>): QueryCacheSnapshot {
  return queryClient.getQueriesData<ConversationsListResponse>({
    queryKey: conversationsQueryKeys.all(),
  });
}

function rollbackFromSnapshot(queryClient: ReturnType<typeof useQueryClient>, snapshot: QueryCacheSnapshot) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

export function useAcceptConversationMutation(currentUserId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptConversation(id),
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKeys.all() });
      const snapshot = snapshotListQueries(queryClient);
      queryClient.setQueriesData<ConversationsListResponse>(
        { queryKey: conversationsQueryKeys.all() },
        (old) => old ? applyOptimisticAccept(old, conversationId, currentUserId) : old,
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) rollbackFromSnapshot(queryClient, context.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: conversationsQueryKeys.all() });
    },
  });
}

export function useLeaveConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveConversation(id),
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKeys.all() });
      const snapshot = snapshotListQueries(queryClient);
      queryClient.setQueriesData<ConversationsListResponse>(
        { queryKey: conversationsQueryKeys.all() },
        (old) => old ? applyOptimisticLeave(old, conversationId) : old,
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) rollbackFromSnapshot(queryClient, context.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: conversationsQueryKeys.all() });
    },
  });
}

export function useResolveConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resolveConversation(id),
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKeys.all() });
      const snapshot = snapshotListQueries(queryClient);
      queryClient.setQueriesData<ConversationsListResponse>(
        { queryKey: conversationsQueryKeys.all() },
        (old) => old ? applyOptimisticResolve(old, conversationId) : old,
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) rollbackFromSnapshot(queryClient, context.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: conversationsQueryKeys.all() });
    },
  });
}

export function useUpdateSubjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, subject }: { id: string; subject: string }) =>
      updateConversationSubject(id, subject),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationsQueryKeys.all(),
      });
    },
  });
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationsQueryKeys.all(),
      });
    },
  });
}
