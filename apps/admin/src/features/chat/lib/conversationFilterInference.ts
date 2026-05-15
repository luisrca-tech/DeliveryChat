import type { Conversation } from "../types/chat.types";
import { isAdminRole } from "./conversationPermissions";

export type ConversationAction = "accept" | "leave" | "resolve";
export type FilterId = "all" | "queue" | "mine" | "closed";

export function inferFilterForAction(
  action: ConversationAction,
  role: string,
): FilterId {
  if (action === "accept") return isAdminRole(role) ? "all" : "mine";
  if (action === "leave") return "queue";
  return "closed";
}

export function inferFilterForConversation(
  conversation: Conversation,
  role: string,
  userId: string,
): FilterId {
  if (conversation.status === "pending")
    return isAdminRole(role) ? "all" : "queue";
  if (conversation.status === "closed") return "closed";
  if (conversation.status === "active") {
    if (isAdminRole(role)) return "all";
    return conversation.assignedTo === userId ? "mine" : "queue";
  }
  return "queue";
}
