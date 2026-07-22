import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../lib/dataTools.client";

export const dataSourceQueryKeys = {
  all: () => ["dataSource"] as const,
  detail: (applicationId: string) =>
    [...dataSourceQueryKeys.all(), applicationId] as const,
};

export function useDataSourceQuery(applicationId: string) {
  return useQuery({
    queryKey: dataSourceQueryKeys.detail(applicationId),
    queryFn: () => getDataSource(applicationId),
    enabled: Boolean(applicationId),
    retry: false,
  });
}
