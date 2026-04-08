import { useQuery } from "@tanstack/react-query";
import {
  listConversations,
  getConversation,
  getMessages,
} from "../lib/conversations.client";
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
