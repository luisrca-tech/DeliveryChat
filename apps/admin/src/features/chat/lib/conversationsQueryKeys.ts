import type { ConversationFilters } from "../types/chat.types";

const ALL_KEY = ["conversations"] as const;

export const conversationsQueryKeys = {
  all: () => ALL_KEY,
  list: (filters: ConversationFilters) =>
    [...ALL_KEY, "list", filters] as const,
  detail: (id: string) => [...ALL_KEY, "detail", id] as const,
  messages: (conversationId: string, limit: number, offset: number) =>
    [...ALL_KEY, "messages", conversationId, limit, offset] as const,
};
