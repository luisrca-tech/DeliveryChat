import { useQuery } from "@tanstack/react-query";
import {
  listConversations,
  getConversation,
  getMessages,
} from "../lib/conversations.client";
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

export function useConversationsQuery(filters: ConversationFilters) {
  return useQuery({
    queryKey: conversationsQueryKeys.list(filters),
    queryFn: () => listConversations(filters),
    staleTime: 10_000,
  });
}

export function useConversationDetailQuery(id: string | null) {
  return useQuery({
    queryKey: conversationsQueryKeys.detail(id ?? ""),
    queryFn: () => getConversation(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useConversationMessagesQuery(
  conversationId: string | null,
  limit = 50,
  offset = 0,
) {
  return useQuery({
    queryKey: conversationsQueryKeys.messages(
      conversationId ?? "",
      limit,
      offset,
    ),
    queryFn: () => getMessages(conversationId!, limit, offset),
    enabled: !!conversationId,
    staleTime: 5_000,
  });
}
