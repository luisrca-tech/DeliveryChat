const PREFIX = "dc_last_msg_";

function key(conversationId: string): string {
  return `${PREFIX}${conversationId}`;
}

export function useLocalMessageSync() {
  function getLastMessageId(conversationId: string): string | undefined {
    return localStorage.getItem(key(conversationId)) ?? undefined;
  }

  function setLastMessageId(conversationId: string, messageId: string): void {
    localStorage.setItem(key(conversationId), messageId);
  }

  return { getLastMessageId, setLastMessageId };
}
