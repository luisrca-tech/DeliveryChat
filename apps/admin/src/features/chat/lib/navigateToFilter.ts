import type { NavigateOptions } from "@tanstack/react-router";
import type { FilterId } from "./conversationFilterInference";

export type NavigateFn = (opts: NavigateOptions) => void;

export function navigateToFilter(
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
