import { useQuery } from "@tanstack/react-query";
import { listMembers } from "../lib/members.client";

export const membersQueryKeys = {
  all: () => ["members"] as const,
  list: (limit: number, offset: number) =>
    [...membersQueryKeys.all(), "list", limit, offset] as const,
};

export function useMembersQuery(limit = 100, offset = 0) {
  return useQuery({
    queryKey: membersQueryKeys.list(limit, offset),
    queryFn: () => listMembers(limit, offset),
    staleTime: 30_000,
  });
}
