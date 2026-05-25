import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type { AiErrorResponse, GenerateReplyResponse, ImproveMessageResponse } from "../types/ai.types";

export class AiApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "AiApiError";
  }
}

export async function generateReplyRequest(
  conversationId: string,
  signal?: AbortSignal,
): Promise<GenerateReplyResponse> {
  const res = await fetch(`${getApiBaseUrl()}/ai/generate-reply`, {
    method: "POST",
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify({ conversationId }),
    signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as AiErrorResponse | null;
    const retryAfter = res.headers.get("Retry-After");
    throw new AiApiError(
      body?.error ?? "unknown_error",
      body?.message ?? `Request failed (${res.status})`,
      res.status,
      retryAfter ? Number(retryAfter) : undefined,
    );
  }

  return (await res.json()) as GenerateReplyResponse;
}

export async function improveMessageRequest(
  conversationId: string,
  draft: string,
  signal?: AbortSignal,
): Promise<ImproveMessageResponse> {
  const res = await fetch(`${getApiBaseUrl()}/ai/improve-message`, {
    method: "POST",
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify({ conversationId, draft }),
    signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as AiErrorResponse | null;
    const retryAfter = res.headers.get("Retry-After");
    throw new AiApiError(
      body?.error ?? "unknown_error",
      body?.message ?? `Request failed (${res.status})`,
      res.status,
      retryAfter ? Number(retryAfter) : undefined,
    );
  }

  return (await res.json()) as ImproveMessageResponse;
}
