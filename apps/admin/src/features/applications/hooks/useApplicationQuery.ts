import { useQuery } from "@tanstack/react-query";
import { getApplication } from "../lib/applications.client";
import { applicationsQueryKeys } from "./useApplicationsQuery";

export function useApplicationQuery(id: string | null) {
  return useQuery({
    queryKey: applicationsQueryKeys.detail(id ?? ""),
    queryFn: () => getApplication(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}
