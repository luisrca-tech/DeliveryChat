import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { conversationsQueryKeys } from "./useConversationsQuery";
import type { WSClientEvent } from "@repo/types";
import type { Message } from "../types/chat.types";

type SendEventFn = (event: WSClientEvent) => void;

export function useMessageActions(sendEvent: SendEventFn) {
  const queryClient = useQueryClient();

  const editMessage = useCallback(
    (conversationId: string, messageId: string, content: string) => {
      // Optimistic update
      queryClient.setQueryData<{ messages: Message[]; limit: number; offset: number }>(
        conversationsQueryKeys.messages(conversationId, 50, 0),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === messageId
                ? { ...msg, content, editedAt: new Date().toISOString() }
                : msg,
            ),
          };
        },
      );

      sendEvent({
        type: "message:edit",
        payload: { conversationId, messageId, content },
      });
    },
    [sendEvent, queryClient],
  );

  const deleteMessage = useCallback(
    (conversationId: string, messageId: string) => {
      // Optimistic update
      queryClient.setQueryData<{ messages: Message[]; limit: number; offset: number }>(
        conversationsQueryKeys.messages(conversationId, 50, 0),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === messageId
                ? { ...msg, isDeleted: true, content: "" }
                : msg,
            ),
          };
        },
      );

      sendEvent({
        type: "message:delete",
        payload: { conversationId, messageId },
      });
    },
    [sendEvent, queryClient],
  );

  return { editMessage, deleteMessage };
}
