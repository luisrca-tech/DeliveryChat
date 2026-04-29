import type { ConversationFilters } from "../types/chat.types";

export const conversationsQueryKeys = {
  all: () => ["conversations"] as const,
  list: (filters: ConversationFilters) =>
    [...conversationsQueryKeys.all(), "list", filters] as const,
  detail: (id: string) =>
    [...conversationsQueryKeys.all(), "detail", id] as const,
  messages: (conversationId: string, limit: number, offset: number) =>
    [
      ...conversationsQueryKeys.all(),
      "messages",
      conversationId,
      limit,
      offset,
    ] as const,
};
