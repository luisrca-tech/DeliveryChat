import type { MessageNewPayload } from "@repo/types";
import type { Message, WebSocketHandlerContext } from "../types/chat.types";

const MAX_PROCESSED_IDS = 500;

export function handleMessageNew(
  msg: MessageNewPayload,
  ctx: WebSocketHandlerContext,
): { clearTypingForSender: boolean } {
  const {
    activeConversationId,
    processedMsgIds,
    messagesQueryKey,
    invalidateQueries,
    setQueryData,
    markAsRead,
  } = ctx;

  if (processedMsgIds.has(msg.id)) return { clearTypingForSender: false };
  processedMsgIds.add(msg.id);

  if (processedMsgIds.size > MAX_PROCESSED_IDS) {
    const first = processedMsgIds.values().next().value;
    if (first) processedMsgIds.delete(first);
  }

  const newMessage: Message = {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderRole: msg.senderRole,
    type: msg.type,
    content: msg.content,
    createdAt: msg.createdAt,
    editedAt: msg.editedAt ?? null,
  };

  setQueryData(messagesQueryKey(msg.conversationId), (old: unknown) => {
    const prev = old as
      | { messages: Message[]; limit: number; offset: number }
      | undefined;
    if (!prev) return { messages: [newMessage], limit: 50, offset: 0 };
    if (prev.messages.some((m) => m.id === msg.id)) return prev;
    return { ...prev, messages: [newMessage, ...prev.messages] };
  });

  invalidateQueries();

  if (
    msg.senderRole === "visitor" &&
    msg.conversationId === activeConversationId
  ) {
    markAsRead(msg.conversationId).catch(console.error);
  }

  return { clearTypingForSender: true };
}
