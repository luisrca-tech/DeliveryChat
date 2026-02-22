import { useQuery } from "@tanstack/react-query";
import { listApiKeys } from "../lib/api-keys.client";

export const apiKeysQueryKeys = {
  all: () => ["apiKeys"] as const,
  list: (applicationId: string) =>
    [...apiKeysQueryKeys.all(), applicationId] as const,
};

export function useApiKeysQuery(applicationId: string | null) {
  return useQuery({
    queryKey: apiKeysQueryKeys.list(applicationId ?? ""),
    queryFn: () => listApiKeys(applicationId!),
    enabled: !!applicationId,
    staleTime: 30_000,
  });
}
