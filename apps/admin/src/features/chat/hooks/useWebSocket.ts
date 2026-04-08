import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WebSocketManager } from "../lib/ws.client";
import { getApiUrl } from "@/lib/urls";
import { getSubdomain } from "@/lib/subdomain";
import { getBearerToken } from "@/lib/bearerToken";
import { conversationsQueryKeys } from "./useConversationsQuery";
import type { WSClientEvent, WSServerEvent } from "@repo/types";
import type { Message } from "../types/chat.types";

type WSMessageHandler = (event: WSServerEvent) => void;

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const managerRef = useRef<WebSocketManager | null>(null);
  const handlersRef = useRef<Set<WSMessageHandler>>(new Set());
  const queryClient = useQueryClient();

  const subscribe = useCallback((handler: WSMessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const sendEvent = useCallback((event: WSClientEvent) => {
    managerRef.current?.send(event);
  }, []);

  useEffect(() => {
    const tenant = getSubdomain();
    const token = getBearerToken();
    if (!tenant || !token) return;

    const apiUrl = getApiUrl();
    const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
    const wsHost = apiUrl.replace(/^https?:\/\//, "");
    const wsUrl = `${wsProtocol}://${wsHost}/v1/ws?tenant=${tenant}&sessionToken=${encodeURIComponent(token)}`;

    const manager = new WebSocketManager({
      url: wsUrl,
      onEvent: (event) => {
        if (event.type === "message:new") {
          const msg = event.payload;
          const newMessage: Message = {
            id: msg.id,
            conversationId: msg.conversationId,
            senderId: msg.senderId,
            senderName: msg.senderName,
            type: msg.type,
            content: msg.content,
            createdAt: msg.createdAt,
          };

          queryClient.setQueryData<{ messages: Message[]; limit: number; offset: number }>(
            conversationsQueryKeys.messages(msg.conversationId, 50, 0),
            (old) => {
              if (!old) return { messages: [newMessage], limit: 50, offset: 0 };
              return {
                ...old,
                messages: [newMessage, ...old.messages],
              };
            },
          );

          queryClient.invalidateQueries({
            queryKey: conversationsQueryKeys.all(),
          });
        }

        // Conversation lifecycle events — invalidate list so queue updates
        if (
          event.type === "conversation:new" ||
          event.type === "conversation:accepted" ||
          event.type === "conversation:released" ||
          event.type === "conversation:resolved"
        ) {
          queryClient.invalidateQueries({
            queryKey: conversationsQueryKeys.all(),
          });
        }

        // Notify all subscribers
        for (const handler of handlersRef.current) {
          handler(event);
        }
      },
      onConnectionChange: setIsConnected,
    });

    managerRef.current = manager;
    manager.connect();

    return () => {
      manager.disconnect();
      managerRef.current = null;
    };
  }, [queryClient]);

  return { isConnected, sendEvent, subscribe };
}
