import { getApiBaseUrl } from "@/lib/urls";
import { getSubdomain } from "@/lib/subdomain";
import { getBearerToken } from "@/lib/bearerToken";
import type {
  ApiKeysListResponse,
  ApiKeyCreatedResponse,
  CreateApiKeyRequest,
  RegenerateApiKeyRequest,
} from "../types/api-keys.types";
import { listApplications } from "@/features/applications/lib/applications.client";

export { listApplications };

const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;

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

  if (res.status === HTTP_NOT_FOUND) {
    throw new ApiKeyNotFoundError(message);
  }
  if (res.status === HTTP_TOO_MANY_REQUESTS) {
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
    headers: getTenantHeaders(),
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
    headers: getTenantHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApiKeyCreatedResponse>(res);
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const res = await fetch(`${base()}/api-keys/${keyId}`, {
    method: "DELETE",
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
}

export async function regenerateApiKey(
  keyId: string,
  body: RegenerateApiKeyRequest = {},
): Promise<ApiKeyCreatedResponse> {
  const res = await fetch(`${base()}/api-keys/${keyId}/regenerate`, {
    method: "POST",
    headers: getTenantHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApiKeyCreatedResponse>(res);
}
