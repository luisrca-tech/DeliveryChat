import { getApiBaseUrl } from "@/lib/urls";
import { getSubdomain } from "@/lib/subdomain";
import { getBearerToken } from "@/lib/bearerToken";
import type {
  RateLimitsResponse,
  UpdateRateLimitsRequest,
} from "../types/rateLimits.types";

function getTenantHeaders(): HeadersInit {
  const tenant = getSubdomain();
  const token = getBearerToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (tenant) headers["X-Tenant-Slug"] = tenant;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function getRateLimits(): Promise<RateLimitsResponse> {
  const res = await fetch(`${getApiBaseUrl()}/rate-limits`, {
    headers: getTenantHeaders(),
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
    headers: getTenantHeaders(),
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
