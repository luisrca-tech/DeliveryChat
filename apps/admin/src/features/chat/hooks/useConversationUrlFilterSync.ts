import { useEffect } from "react";
import type { NavigateOptions } from "@tanstack/react-router";
import type { WSServerEvent } from "@repo/types";
import {
  navigateSearchAfterAccept,
  navigateSearchAfterLeave,
  navigateSearchAfterResolve,
} from "../lib/conversationSearchNavigation";

type NavigateFn = (opts: NavigateOptions) => void;

/**
 * Keeps TanStack Router search `filter` aligned with lifecycle events so list queries
 * match the selected conversation (queue vs mine vs all vs closed).
 */
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
      if (event.type === "conversation:accepted") {
        const { conversationId, assignedTo } = event.payload;
        if (!sessionUserId || assignedTo !== sessionUserId) return;
        if (!selectedId || conversationId !== selectedId) return;
        navigateSearchAfterAccept(
          navigate,
          conversationId,
          currentUserRole,
          urlFilter,
        );
        return;
      }

      if (event.type === "conversation:released") {
        const { conversationId } = event.payload;
        if (!selectedId || conversationId !== selectedId) return;
        navigateSearchAfterLeave(navigate, conversationId, urlFilter);
        return;
      }

      if (event.type === "conversation:resolved") {
        const { conversationId, resolvedBy } = event.payload;
        if (!sessionUserId || resolvedBy !== sessionUserId) return;
        if (!selectedId || conversationId !== selectedId) return;
        navigateSearchAfterResolve(navigate, conversationId, urlFilter);
      }
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
