import type { MessageEditedPayload } from "@repo/types";
import type { Message } from "../types/chat.types";

export type HandleMessageEditedDeps = {
  messagesQueryKey: (conversationId: string) => readonly unknown[];
  setQueryData: (queryKey: readonly unknown[], updater: (old: unknown) => unknown) => void;
};

export function handleMessageEdited(
  payload: MessageEditedPayload,
  deps: HandleMessageEditedDeps,
): void {
  const { conversationId, messageId, content, editedAt } = payload;

  deps.setQueryData(
    deps.messagesQueryKey(conversationId),
    (old: unknown) => {
      const prev = old as { messages: Message[]; limit: number; offset: number } | undefined;
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((msg) =>
          msg.id === messageId ? { ...msg, content, editedAt } : msg,
        ),
      };
    },
  );
}
