import type { Conversation } from "../types/chat.types";

export function isAdminRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

export type ConversationPermissions = {
  isAdmin: boolean;
  isAssigned: boolean;
  canViewAll: boolean;
  canDelete: boolean;
  canAccept: boolean;
  canLeave: boolean;
  canResolve: boolean;
  canEditSubject: boolean;
  canSend: boolean;
};

export function getConversationPermissions(
  role: string,
  conversation: Conversation,
  userId: string,
): ConversationPermissions {
  const isAdmin = role === "admin" || role === "super_admin";
  const isAssigned = conversation.assignedTo === userId;
  const isActive = conversation.status === "active";
  const isPending = conversation.status === "pending";
  const isStaff = role !== "visitor";

  return {
    isAdmin,
    isAssigned,
    canViewAll: isAdmin,
    canDelete: isAdmin,
    canAccept: isPending && conversation.assignedTo === null,
    canLeave: isActive && isAssigned,
    canResolve: isActive && isAssigned,
    canEditSubject: isActive && isAssigned,
    canSend: isActive && (!isStaff || isAssigned),
  };
}
