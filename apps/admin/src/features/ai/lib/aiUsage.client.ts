import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  AiUsageLogsResponse,
  AiUsageFilters,
} from "../types/aiUsage.types";

export async function fetchAiUsageLogs(
  filters: AiUsageFilters & { limit?: number; offset?: number } = {},
): Promise<AiUsageLogsResponse> {
  const params = new URLSearchParams();

  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.offset != null) params.set("offset", String(filters.offset));
  if (filters.action) params.set("action", filters.action);
  if (filters.status) params.set("status", filters.status);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const qs = params.toString();
  const url = `${getApiBaseUrl()}/ai/usage${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: getTenantHeaders(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      (body as { message?: string })?.message ??
        `Failed to fetch AI usage logs (${res.status})`,
    );
  }

  return res.json() as Promise<AiUsageLogsResponse>;
}
