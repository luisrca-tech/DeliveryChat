import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  AiAddonErrorCode,
  AiAddonResponse,
  BillingStatusResponse,
  CheckoutRequest,
  CheckoutResponse,
  PortalSessionResponse,
} from "../types/billing.types";

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Carries the backend error code so callers can render a code-specific message. */
export class AiAddonError extends Error {
  code: AiAddonErrorCode;

  constructor(code: AiAddonErrorCode, message: string) {
    super(message);
    this.name = "AiAddonError";
    this.code = code;
  }
}

async function parseAiAddonError(res: Response): Promise<never> {
  const err = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  const code = (err?.error as AiAddonErrorCode | undefined) ?? "unknown_error";
  throw new AiAddonError(
    code,
    err?.message || `Request failed (${res.status})`,
  );
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
      err?.message || err?.error || `Request failed (${res.status})`,
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
      err?.message || err?.error || `Request failed (${res.status})`,
    );
  }
  return await parseJson<PortalSessionResponse>(res);
}

export async function createCheckout(
  body: CheckoutRequest,
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
      err?.message || err?.error || `Request failed (${res.status})`,
    );
  }
  return await parseJson<CheckoutResponse>(res);
}

export async function enableAiAddon(): Promise<AiAddonResponse> {
  const res = await fetch(`${getApiBaseUrl()}/billing/ai-addon`, {
    method: "POST",
    headers: getTenantHeaders(),
  });
  if (!res.ok) return parseAiAddonError(res);
  return await parseJson<AiAddonResponse>(res);
}

export async function cancelAiAddon(): Promise<AiAddonResponse> {
  const res = await fetch(`${getApiBaseUrl()}/billing/ai-addon`, {
    method: "DELETE",
    headers: getTenantHeaders(),
  });
  if (!res.ok) return parseAiAddonError(res);
  return await parseJson<AiAddonResponse>(res);
}
