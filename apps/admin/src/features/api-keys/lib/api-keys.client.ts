import { HTTP_STATUS } from "@repo/types";
import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  ApiKeysListResponse,
  ApiKeyCreatedResponse,
  CreateApiKeyRequest,
  RegenerateApiKeyRequest,
} from "../types/api-keys.types";
import { listApplications } from "@/features/applications/lib/applications.client";

export { listApplications };

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function handleError(res: Response): Promise<never> {
  const err = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  const message =
    err?.message ?? err?.error ?? `Request failed (${res.status})`;

  if (res.status === HTTP_STATUS.NOT_FOUND) {
    throw new ApiKeyNotFoundError(message);
  }
  if (res.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    throw new ApiKeyLimitError(message);
  }

  throw new Error(message);
}

export class ApiKeyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyNotFoundError";
  }
}

export class ApiKeyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyLimitError";
  }
}

const base = () => getApiBaseUrl();

export async function listApiKeys(
  applicationId: string,
): Promise<ApiKeysListResponse> {
  const res = await fetch(`${base()}/applications/${applicationId}/api-keys`, {
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApiKeysListResponse>(res);
}

export async function createApiKey(
  applicationId: string,
  body: CreateApiKeyRequest,
): Promise<ApiKeyCreatedResponse> {
  const res = await fetch(`${base()}/applications/${applicationId}/api-keys`, {
    method: "POST",
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApiKeyCreatedResponse>(res);
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const res = await fetch(`${base()}/api-keys/${keyId}`, {
    method: "DELETE",
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) throw await handleError(res);
}

export async function regenerateApiKey(
  keyId: string,
  body: RegenerateApiKeyRequest = {},
): Promise<ApiKeyCreatedResponse> {
  const res = await fetch(`${base()}/api-keys/${keyId}/regenerate`, {
    method: "POST",
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApiKeyCreatedResponse>(res);
}
