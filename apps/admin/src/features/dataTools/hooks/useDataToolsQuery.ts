import { useQuery } from "@tanstack/react-query";
import { listDataTools } from "../lib/dataTools.client";

export const dataToolsQueryKeys = {
  all: () => ["dataTools"] as const,
  list: (applicationId: string) =>
    [...dataToolsQueryKeys.all(), applicationId] as const,
};

export function useDataToolsQuery(applicationId: string) {
  return useQuery({
    queryKey: dataToolsQueryKeys.list(applicationId),
    queryFn: () => listDataTools(applicationId),
    enabled: Boolean(applicationId),
    retry: false,
  });
}
