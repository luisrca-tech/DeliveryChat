import { useEffect } from "react";
import type { NavigateOptions } from "@tanstack/react-router";
import type { WSServerEvent } from "@repo/types";
import {
  inferFilterForAction,
  type FilterId,
  type ConversationAction,
} from "../lib/conversationFilterInference";

type NavigateFn = (opts: NavigateOptions) => void;

function navigateToFilter(
  navigate: NavigateFn,
  conversationId: string,
  currentFilter: string | undefined,
  targetFilter: FilterId,
): void {
  if (currentFilter === targetFilter) return;
  navigate({
    search: (prev) => ({
      ...prev,
      filter: targetFilter,
      conversationId: prev.conversationId ?? conversationId,
      appId: prev.appId,
    }),
    replace: true,
  });
}

export function useConversationUrlFilterSync(
  selectedId: string | undefined,
  urlFilter: string | undefined,
  sessionUserId: string,
  currentUserRole: string,
  navigate: NavigateFn,
  subscribe: (handler: (event: WSServerEvent) => void) => () => void,
): void {
  useEffect(() => {
    return subscribe((event: WSServerEvent) => {
      let action: ConversationAction;
      let conversationId: string;

      if (event.type === "conversation:accepted") {
        const { conversationId: cid, assignedTo } = event.payload;
        if (!sessionUserId || assignedTo !== sessionUserId) return;
        conversationId = cid;
        action = "accept";
      } else if (event.type === "conversation:released") {
        conversationId = event.payload.conversationId;
        action = "leave";
      } else if (event.type === "conversation:resolved") {
        const { conversationId: cid, resolvedBy } = event.payload;
        if (!sessionUserId || resolvedBy !== sessionUserId) return;
        conversationId = cid;
        action = "resolve";
      } else {
        return;
      }

      if (!selectedId || conversationId !== selectedId) return;

      const targetFilter = inferFilterForAction(action, currentUserRole);
      navigateToFilter(navigate, conversationId, urlFilter, targetFilter);
    });
  }, [
    selectedId,
    urlFilter,
    sessionUserId,
    currentUserRole,
    navigate,
    subscribe,
  ]);
}
