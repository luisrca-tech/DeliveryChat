import type { ConversationsListResponse } from "../types/chat.types";

function updateConversation(
  data: ConversationsListResponse,
  conversationId: string,
  updater: (conv: ConversationsListResponse["conversations"][number]) => ConversationsListResponse["conversations"][number],
): ConversationsListResponse {
  const idx = data.conversations.findIndex((c) => c.id === conversationId);
  if (idx === -1) return data;

  const updated = [...data.conversations];
  updated[idx] = updater({ ...updated[idx]! });
  return { ...data, conversations: updated };
}

export function applyOptimisticAccept(
  data: ConversationsListResponse,
  conversationId: string,
  userId: string,
): ConversationsListResponse {
  return updateConversation(data, conversationId, (conv) => ({
    ...conv,
    status: "active",
    assignedTo: userId,
  }));
}

export function applyOptimisticLeave(
  data: ConversationsListResponse,
  conversationId: string,
): ConversationsListResponse {
  return updateConversation(data, conversationId, (conv) => ({
    ...conv,
    status: "pending",
    assignedTo: null,
  }));
}

export function applyOptimisticResolve(
  data: ConversationsListResponse,
  conversationId: string,
): ConversationsListResponse {
  return updateConversation(data, conversationId, (conv) => ({
    ...conv,
    status: "closed",
  }));
}
