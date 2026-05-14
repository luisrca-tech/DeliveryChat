import type { MessageDeletedPayload } from "@repo/types";
import type { Message, WebSocketHandlerContext } from "../types/chat.types";

export function handleMessageDeleted(
  payload: MessageDeletedPayload,
  ctx: WebSocketHandlerContext,
): void {
  const { conversationId, messageId } = payload;

  ctx.setQueryData(
    ctx.messagesQueryKey(conversationId),
    (old: unknown) => {
      const prev = old as { messages: Message[]; limit: number; offset: number } | undefined;
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((msg) =>
          msg.id === messageId ? { ...msg, isDeleted: true, content: "" } : msg,
        ),
      };
    },
  );
}
