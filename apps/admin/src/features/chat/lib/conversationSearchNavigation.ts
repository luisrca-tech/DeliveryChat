import type { NavigateOptions } from "@tanstack/react-router";

type NavigateFn = (opts: NavigateOptions) => void;

function nextFilterAfterAccept(currentUserRole: string): "all" | "mine" {
  const isAdmin =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  return isAdmin ? "all" : "mine";
}

/**
 * After accept, the conversation is active — list tabs must match so the item stays visible.
 */
export function navigateSearchAfterAccept(
  navigate: NavigateFn,
  conversationId: string,
  currentUserRole: string,
  currentFilter: string | undefined,
): void {
  const next = nextFilterAfterAccept(currentUserRole);
  if (currentFilter === next) return;

  navigate({
    search: (prev) => ({
      ...prev,
      filter: next,
      conversationId: prev.conversationId ?? conversationId,
      appId: prev.appId,
    }),
    replace: true,
  });
}

export function navigateSearchAfterLeave(
  navigate: NavigateFn,
  conversationId: string,
  currentFilter: string | undefined,
): void {
  if (currentFilter === "queue") return;

  navigate({
    search: (prev) => ({
      ...prev,
      filter: "queue",
      conversationId: prev.conversationId ?? conversationId,
      appId: prev.appId,
    }),
    replace: true,
  });
}

export function navigateSearchAfterResolve(
  navigate: NavigateFn,
  conversationId: string,
  currentFilter: string | undefined,
): void {
  if (currentFilter === "closed") return;

  navigate({
    search: (prev) => ({
      ...prev,
      filter: "closed",
      conversationId: prev.conversationId ?? conversationId,
      appId: prev.appId,
    }),
    replace: true,
  });
}
