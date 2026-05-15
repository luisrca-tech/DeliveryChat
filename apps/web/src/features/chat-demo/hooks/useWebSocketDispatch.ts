import { useRef, useCallback } from "react";
import type { RefObject, MutableRefObject } from "react";
import { wsMessageReducer } from "../lib/wsMessageReducer";
import type {
  WsReducerState,
  OptimisticMessage,
} from "../lib/wsMessageReducer";
import type { Conversation } from "../chat-client";

export type WsDispatchOptions = {
  wsRef: RefObject<WebSocket | null>;
  conversationClosedRef: MutableRefObject<boolean>;
  selectedIdRef: RefObject<string | null>;
  messages: OptimisticMessage[];
  conversations: Conversation[];
  operatorTypingName: string | null;
  setMessages: (msgs: OptimisticMessage[]) => void;
  setConversations: (convs: Conversation[]) => void;
  setOperatorTypingName: (name: string | null) => void;
  setLastMessageId: (conversationId: string, messageId: string) => void;
  onMarkAsRead: (conversationId: string, messageId: string) => void;
  refreshUnread: (conversationId: string) => Promise<void>;
};

export function useWebSocketDispatch({
  wsRef,
  conversationClosedRef,
  selectedIdRef,
  messages,
  conversations,
  operatorTypingName,
  setMessages,
  setConversations,
  setOperatorTypingName,
  setLastMessageId,
  onMarkAsRead,
  refreshUnread,
}: WsDispatchOptions) {
  // Updated every render so the stable handleWsMessage always reads latest state.
  const stateRef = useRef<WsReducerState>({
    messages,
    conversations,
    operatorTypingName,
  });
  stateRef.current = { messages, conversations, operatorTypingName };

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const wsEvent = parsed as {
        type: string;
        payload: Record<string, unknown>;
      };
      const current = stateRef.current;
      const { state: next, sideEffects } = wsMessageReducer(
        current,
        wsEvent,
        selectedIdRef.current,
      );

      if (next.messages !== current.messages) setMessages(next.messages);
      if (next.conversations !== current.conversations)
        setConversations(next.conversations);
      if (next.operatorTypingName !== current.operatorTypingName)
        setOperatorTypingName(next.operatorTypingName);

      for (const effect of sideEffects) {
        switch (effect.kind) {
          case "close-socket":
            conversationClosedRef.current = true;
            wsRef.current?.close();
            (wsRef as MutableRefObject<WebSocket | null>).current = null;
            break;
          case "persist-last-message":
            setLastMessageId(effect.conversationId, effect.messageId);
            break;
          case "mark-as-read":
            onMarkAsRead(effect.conversationId, effect.messageId);
            break;
          case "refresh-unread":
            void refreshUnread(effect.conversationId);
            break;
        }
      }
    },
    // All deps are stable refs or stable callbacks — handleWsMessage never changes identity.
    [
      wsRef,
      conversationClosedRef,
      selectedIdRef,
      setMessages,
      setConversations,
      setOperatorTypingName,
      setLastMessageId,
      onMarkAsRead,
      refreshUnread,
    ],
  );

  return { handleWsMessage };
}
