import { useCallback } from "react";

const PREFIX = "dc_last_msg_";

function key(conversationId: string): string {
  return `${PREFIX}${conversationId}`;
}

export function useLocalMessageSync() {
  const getLastMessageId = useCallback(
    (conversationId: string): string | undefined => {
      return localStorage.getItem(key(conversationId)) ?? undefined;
    },
    [],
  );

  const setLastMessageId = useCallback(
    (conversationId: string, messageId: string): void => {
      localStorage.setItem(key(conversationId), messageId);
    },
    [],
  );

  return { getLastMessageId, setLastMessageId };
}
