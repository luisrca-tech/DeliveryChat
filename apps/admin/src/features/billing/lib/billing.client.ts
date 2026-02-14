import { getApiBaseUrl } from "@/lib/urls";
import { getSubdomain } from "@/lib/subdomain";
import { getBearerToken } from "@/lib/bearerToken";
import type {
  BillingStatusResponse,
  CheckoutRequest,
  CheckoutResponse,
  PortalSessionResponse,
} from "../types/billing.types";

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function getTenantHeaders(): HeadersInit | undefined {
  const tenant = getSubdomain();
  const token = getBearerToken();
  const headers: Record<string, string> = {};
  if (tenant) headers["X-Tenant-Slug"] = tenant;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return Object.keys(headers).length ? headers : undefined;
}

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  const res = await fetch(`${getApiBaseUrl()}/billing/status`, {
    headers: getTenantHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      err?.message || err?.error || `Request failed (${res.status})`
    );
  }
  return await parseJson<BillingStatusResponse>(res);
}

export async function createPortalSession(): Promise<PortalSessionResponse> {
  const res = await fetch(`${getApiBaseUrl()}/billing/portal-session`, {
    method: "POST",
    headers: getTenantHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      err?.message || err?.error || `Request failed (${res.status})`
    );
  }
  return await parseJson<PortalSessionResponse>(res);
}

export async function createCheckout(
  body: CheckoutRequest
): Promise<CheckoutResponse> {
  const res = await fetch(`${getApiBaseUrl()}/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getTenantHeaders() ?? {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      err?.message || err?.error || `Request failed (${res.status})`
    );
  }
  return await parseJson<CheckoutResponse>(res);
}
