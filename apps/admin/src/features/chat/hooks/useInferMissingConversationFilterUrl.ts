import { useEffect } from "react";
import type { NavigateOptions } from "@tanstack/react-router";
import { useConversationDetailQuery } from "./useConversationsQuery";
import { isAdminRole } from "../lib/conversationPermissions";
import { inferFilterForConversation } from "../lib/conversationFilterInference";

type NavigateFn = (opts: NavigateOptions) => void;

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
    const needsSessionForInfer = !isAdminRole(currentUserRole);
    if (needsSessionForInfer && !sessionUserId) return;

    const inferred = inferFilterForConversation(
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
