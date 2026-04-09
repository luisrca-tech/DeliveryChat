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

export type TypingUser = {
  userId: string;
  userName: string | null;
  senderRole: string;
} | null;

const TYPING_TIMEOUT_MS = 3_000;

export function useWebSocket(activeConversationId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [typingUser, setTypingUser] = useState<TypingUser>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const managerRef = useRef<WebSocketManager | null>(null);
  const handlersRef = useRef<Set<WSMessageHandler>>(new Set());
  const queryClient = useQueryClient();

  const clearTyping = useCallback(() => {
    setTypingUser(null);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const subscribe = useCallback((handler: WSMessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const sendEvent = useCallback((event: WSClientEvent) => {
    managerRef.current?.send(event);
  }, []);

  const setActiveRoom = useCallback(
    (conversationId: string | null, lastMessageId?: string, force?: boolean) => {
      managerRef.current?.setActiveRoom(conversationId, lastMessageId, force);
    },
    [],
  );

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
          console.log(`[WS:Hook] message:new received — msgId=${msg.id} convId=${msg.conversationId} senderId=${msg.senderId} role=${msg.senderRole}`);
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

          // Clear typing indicator when the typing user sends a message
          setTypingUser((current) =>
            current?.userId === msg.senderId ? null : current,
          );
          if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
          }
        }

        if (event.type === "typing:start") {
          const payload = event.payload;
          setTypingUser({
            userId: payload.userId,
            userName: payload.userName,
            senderRole: payload.senderRole,
          });
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setTypingUser(null), TYPING_TIMEOUT_MS);
        }

        if (event.type === "typing:stop") {
          const payload = event.payload;
          setTypingUser((current) =>
            current?.userId === payload.userId ? null : current,
          );
          if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = null;
          }
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

  useEffect(() => {
    managerRef.current?.setActiveRoom(activeConversationId);
    clearTyping();
  }, [activeConversationId, clearTyping]);

  return { isConnected, sendEvent, subscribe, setActiveRoom, typingUser };
}
