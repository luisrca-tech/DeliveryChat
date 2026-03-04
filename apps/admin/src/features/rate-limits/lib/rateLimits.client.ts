import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  RateLimitsResponse,
  UpdateRateLimitsRequest,
} from "../types/rateLimits.types";

export async function getRateLimits(): Promise<RateLimitsResponse> {
  const res = await fetch(`${getApiBaseUrl()}/rate-limits`, {
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      err?.message || err?.error || `Request failed (${res.status})`,
    );
  }
  return (await res.json()) as RateLimitsResponse;
}

export async function updateRateLimits(
  body: UpdateRateLimitsRequest,
): Promise<{ success: boolean; limits: RateLimitsResponse["limits"] }> {
  const res = await fetch(`${getApiBaseUrl()}/rate-limits`, {
    method: "PUT",
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      err?.message || err?.error || `Request failed (${res.status})`,
    );
  }
  return (await res.json()) as {
    success: boolean;
    limits: RateLimitsResponse["limits"];
  };
}
