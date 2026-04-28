import type { MessageDeletedPayload } from "@repo/types";
import type { Message } from "../types/chat.types";

export type HandleMessageDeletedDeps = {
  messagesQueryKey: (conversationId: string) => readonly unknown[];
  setQueryData: (queryKey: readonly unknown[], updater: (old: unknown) => unknown) => void;
};

export function handleMessageDeleted(
  payload: MessageDeletedPayload,
  deps: HandleMessageDeletedDeps,
): void {
  const { conversationId, messageId } = payload;

  deps.setQueryData(
    deps.messagesQueryKey(conversationId),
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
