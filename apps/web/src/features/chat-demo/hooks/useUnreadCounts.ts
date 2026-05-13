import { useState, useCallback } from "react";
import type { ChatClient } from "../chat-client";

export function useUnreadCounts(client: ChatClient) {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const clearUnread = useCallback((conversationId: string) => {
    setUnreadCounts((prev) => ({ ...prev, [conversationId]: 0 }));
  }, []);

  const refreshUnread = useCallback(
    async (conversationId: string) => {
      try {
        const { unreadCount } = await client.getUnreadCount(conversationId);
        setUnreadCounts((prev) => ({ ...prev, [conversationId]: unreadCount }));
      } catch {
        // network errors are non-fatal
      }
    },
    [client],
  );

  return { unreadCounts, setUnreadCounts, clearUnread, refreshUnread };
}
