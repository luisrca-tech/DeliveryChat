import { useQuery } from "@tanstack/react-query";
import { listApplications } from "../lib/applications.client";

export const applicationsQueryKeys = {
  all: () => ["applications"] as const,
  list: (limit: number, offset: number, hasMyConversations?: boolean) =>
    [...applicationsQueryKeys.all(), "list", limit, offset, { hasMyConversations }] as const,
  detail: (id: string) =>
    [...applicationsQueryKeys.all(), "detail", id] as const,
};

export function useApplicationsQuery(
  limit = 100,
  offset = 0,
  options?: { hasMyConversations?: boolean },
) {
  return useQuery({
    queryKey: applicationsQueryKeys.list(limit, offset, options?.hasMyConversations),
    queryFn: () => listApplications(limit, offset, options),
    staleTime: 30_000,
  });
}
