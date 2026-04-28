import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  acceptConversation,
  leaveConversation,
  resolveConversation,
  deleteConversation,
  updateConversationSubject,
} from "../lib/conversations.client";
import {
  applyOptimisticAccept,
  applyOptimisticLeave,
  applyOptimisticResolve,
} from "../lib/optimisticConversationUpdates";
import { buildConversationMutationOptions } from "../lib/conversationMutationFactory";

export function useAcceptConversationMutation(currentUserId: string) {
  const queryClient = useQueryClient();
  return useMutation(
    buildConversationMutationOptions(queryClient, {
      mutationFn: (id: string) => acceptConversation(id),
      optimisticUpdater: (data, id) => applyOptimisticAccept(data, id, currentUserId),
    }),
  );
}

export function useLeaveConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation(
    buildConversationMutationOptions(queryClient, {
      mutationFn: (id: string) => leaveConversation(id),
      optimisticUpdater: (data, id) => applyOptimisticLeave(data, id),
    }),
  );
}

export function useResolveConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation(
    buildConversationMutationOptions(queryClient, {
      mutationFn: (id: string) => resolveConversation(id),
      optimisticUpdater: (data, id) => applyOptimisticResolve(data, id),
    }),
  );
}

export function useUpdateSubjectMutation() {
  const queryClient = useQueryClient();
  return useMutation(
    buildConversationMutationOptions(queryClient, {
      mutationFn: ({ id, subject }: { id: string; subject: string }) =>
        updateConversationSubject(id, subject),
    }),
  );
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation(
    buildConversationMutationOptions(queryClient, {
      mutationFn: (id: string) => deleteConversation(id),
    }),
  );
}
