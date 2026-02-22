import { useQuery } from "@tanstack/react-query";
import { listApplications } from "../lib/api-keys.client";

export const applicationsQueryKeys = {
  all: () => ["applications"] as const,
  list: (limit: number, offset: number) =>
    [...applicationsQueryKeys.all(), "list", limit, offset] as const,
};

export function useApplicationsQuery(limit = 100, offset = 0) {
  return useQuery({
    queryKey: applicationsQueryKeys.list(limit, offset),
    queryFn: () => listApplications(limit, offset),
    staleTime: 30_000,
  });
}
