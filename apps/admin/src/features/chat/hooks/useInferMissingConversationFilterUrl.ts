import { useEffect } from "react";
import type { NavigateOptions } from "@tanstack/react-router";
import { useConversationDetailQuery } from "./useConversationsQuery";
import type { Conversation } from "../types/chat.types";

function inferFilterForUrl(
  conversation: Conversation,
  currentUserRole: string,
  sessionUserId: string,
): string {
  const isAdmin =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  if (conversation.status === "pending") return "queue";
  if (conversation.status === "closed") return "closed";
  if (conversation.status === "active") {
    if (isAdmin) return "all";
    return conversation.assignedTo === sessionUserId ? "mine" : "queue";
  }
  return "queue";
}

type NavigateFn = (opts: NavigateOptions) => void;

/**
 * When the URL has conversationId but no filter (e.g. deep link / refresh),
 * loads detail and replaces search with an inferred filter so the list query matches.
 */
export function useInferMissingConversationFilterUrl(
  selectedId: string | undefined,
  urlFilter: string | undefined,
  currentUserRole: string,
  sessionUserId: string,
  navigate: NavigateFn,
) {
  const { data: detailForUrl } = useConversationDetailQuery(selectedId ?? null);
  const conversationSnapshot = detailForUrl?.conversation;

  useEffect(() => {
    if (!selectedId || urlFilter) return;
    if (!conversationSnapshot) return;
    const needsSessionForInfer =
      currentUserRole !== "admin" && currentUserRole !== "super_admin";
    if (needsSessionForInfer && !sessionUserId) return;

    const inferred = inferFilterForUrl(
      conversationSnapshot,
      currentUserRole,
      sessionUserId,
    );
    navigate({
      search: (prev) => ({ ...prev, filter: inferred }),
      replace: true,
    });
  }, [
    selectedId,
    urlFilter,
    conversationSnapshot,
    currentUserRole,
    sessionUserId,
    navigate,
  ]);
}
