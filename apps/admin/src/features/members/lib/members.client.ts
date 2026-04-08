import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type { MembersListResponse } from "../types/members.types";

const base = () => getApiBaseUrl();

export async function listMembers(
  limit = 100,
  offset = 0,
): Promise<MembersListResponse> {
  const res = await fetch(
    `${base()}/users?limit=${limit}&offset=${offset}`,
    { headers: getTenantHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      (err as { message?: string })?.message ?? `Failed to fetch members (${res.status})`,
    );
  }
  return res.json() as Promise<MembersListResponse>;
}
