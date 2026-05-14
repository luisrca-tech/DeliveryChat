import { useEffect } from "react";
import type { WSServerEvent } from "@repo/types";
import {
  inferFilterForAction,
  type ConversationAction,
} from "../lib/conversationFilterInference";
import { navigateToFilter, type NavigateFn } from "../lib/navigateToFilter";

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
