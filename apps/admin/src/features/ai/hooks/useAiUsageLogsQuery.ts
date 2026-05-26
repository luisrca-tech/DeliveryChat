import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchAiUsageLogs } from "../lib/aiUsage.client";
import type { AiUsageFilters } from "../types/aiUsage.types";

export const aiUsageQueryKeys = {
  all: ["aiUsage"] as const,
  list: (filters: AiUsageFilters & { limit?: number; offset?: number }) =>
    ["aiUsage", "list", filters] as const,
};

export function useAiUsageLogsQuery(
  filters: AiUsageFilters & { limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: aiUsageQueryKeys.list(filters),
    queryFn: () => fetchAiUsageLogs(filters),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
