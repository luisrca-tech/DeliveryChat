import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatClient } from "../chat-client";
import type { OptimisticMessage } from "../lib/wsMessageReducer";

export interface UseMessageHistoryOptions {
  selectedId: string | null;
  client: ChatClient;
  setLastMessageId: (conversationId: string, messageId: string) => void;
  clearUnread: (conversationId: string) => void;
}

export function useMessageHistory({
  selectedId,
  client,
  setLastMessageId,
  clearUnread,
}: UseMessageHistoryOptions) {
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingMsgs(true);
    setMessages([]);
    client
      .getMessages(selectedId)
      .then(({ messages: msgs }) => {
        const ordered = [...msgs]
          .reverse()
          .map((m) => ({
            ...m,
            type: m.type === "system" ? ("system" as const) : ("text" as const),
          }));
        setMessages(ordered);
        const lastMsg = ordered[ordered.length - 1];
        if (lastMsg) {
          setLastMessageId(selectedId, lastMsg.id);
          client.markAsRead(selectedId, lastMsg.id).catch(() => {});
        }
        clearUnread(selectedId);
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [selectedId, client, setLastMessageId, clearUnread]);

  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    const viewport = el.closest("[data-radix-scroll-area-viewport]");
    if (viewport) {
      (viewport as HTMLElement).scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const appendMessage = useCallback((msg: OptimisticMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const replaceMessage = useCallback(
    (id: string, content: string, editedAt: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content, editedAt } : m)),
      );
    },
    [],
  );

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const rollbackMessage = useCallback((clientId: string) => {
    setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
  }, []);

  return {
    messages,
    setMessages,
    loadingMsgs,
    messagesEndRef,
    appendMessage,
    replaceMessage,
    removeMessage,
    rollbackMessage,
  };
}
