import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  acceptConversation,
  leaveConversation,
  resolveConversation,
  deleteConversation,
} from "../lib/conversations.client";
import { conversationsQueryKeys } from "./useConversationsQuery";

export function useAcceptConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationsQueryKeys.all(),
      });
    },
  });
}

export function useLeaveConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: conversationsQueryKeys.all(),
      });
    },
  });
}

export function useResolveConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resolveConversation(id),
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
