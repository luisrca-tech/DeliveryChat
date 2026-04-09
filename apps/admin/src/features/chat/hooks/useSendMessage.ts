import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { conversationsQueryKeys } from "./useConversationsQuery";
import type { WSServerEvent } from "@repo/types";
import type { Message } from "../types/chat.types";

const ACK_TIMEOUT = 10_000;

type SendMessageFn = (event: {
  type: "message:send";
  payload: {
    conversationId: string;
    content: string;
    clientMessageId: string;
  };
}) => void;

type SubscribeFn = (handler: (event: WSServerEvent) => void) => () => void;

export function useSendMessage(
  sendEvent: SendMessageFn,
  subscribe: SubscribeFn,
  currentUserId: string,
) {
  const queryClient = useQueryClient();
  const pendingRef = useRef<
    Map<string, { conversationId: string; timer: ReturnType<typeof setTimeout> }>
  >(new Map());

  // Listen for ACKs to confirm optimistic messages
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== "message:ack") return;

      const pending = pendingRef.current.get(event.payload.clientMessageId);
      if (!pending) return;

      clearTimeout(pending.timer);
      pendingRef.current.delete(event.payload.clientMessageId);

      // Replace optimistic message with server-confirmed data
      queryClient.setQueryData<{ messages: Message[]; limit: number; offset: number }>(
        conversationsQueryKeys.messages(pending.conversationId, 50, 0),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === event.payload.clientMessageId
                ? { ...msg, id: event.payload.serverMessageId, createdAt: event.payload.createdAt }
                : msg,
            ),
          };
        },
      );
    });

    return unsubscribe;
  }, [subscribe, queryClient]);

  const send = useCallback(
    (conversationId: string, content: string) => {
      const clientMessageId = crypto.randomUUID();

      // Optimistic insert into query cache
      const optimisticMessage: Message = {
        id: clientMessageId,
        conversationId,
        senderId: currentUserId,
        senderName: null,
        type: "text",
        content,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<{ messages: Message[]; limit: number; offset: number }>(
        conversationsQueryKeys.messages(conversationId, 50, 0),
        (old) => {
          if (!old) return { messages: [optimisticMessage], limit: 50, offset: 0 };
          return {
            ...old,
            messages: [optimisticMessage, ...old.messages],
          };
        },
      );

      // Send via WebSocket
      sendEvent({
        type: "message:send",
        payload: { conversationId, content, clientMessageId },
      });

      // Track pending ACK with timeout
      const timer = setTimeout(() => {
        pendingRef.current.delete(clientMessageId);
      }, ACK_TIMEOUT);

      pendingRef.current.set(clientMessageId, { conversationId, timer });
    },
    [sendEvent, currentUserId, queryClient],
  );

  return { send };
}
