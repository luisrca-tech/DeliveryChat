import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  BillingStatusResponse,
  CheckoutRequest,
  CheckoutResponse,
  PortalSessionResponse,
} from "../types/billing.types";

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
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
    headers: getTenantHeaders({ json: true }),
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
