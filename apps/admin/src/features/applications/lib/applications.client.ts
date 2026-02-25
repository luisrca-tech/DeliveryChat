import { HTTP_STATUS } from "@repo/types";
import { getApiBaseUrl } from "@/lib/urls";
import { getSubdomain } from "@/lib/subdomain";
import { getBearerToken } from "@/lib/bearerToken";
import type {
  Application,
  ApplicationsListResponse,
  ApplicationDetailResponse,
  CreateApplicationRequest,
  UpdateApplicationRequest,
} from "../types/applications.types";

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

  if (res.status === HTTP_STATUS.NOT_FOUND) {
    throw new ApplicationNotFoundError(message);
  }
  if (res.status === HTTP_STATUS.CONFLICT) {
    throw new ApplicationDomainConflictError(message);
  }

  throw new Error(message);
}

export class ApplicationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationNotFoundError";
  }
}

export class ApplicationDomainConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationDomainConflictError";
  }
}

const base = () => getApiBaseUrl();

export async function listApplications(
  limit = 100,
  offset = 0,
): Promise<ApplicationsListResponse> {
  const res = await fetch(
    `${base()}/applications?limit=${limit}&offset=${offset}`,
    { headers: getTenantHeaders() },
  );
  if (!res.ok) throw await handleError(res);
  return parseJson<ApplicationsListResponse>(res);
}

export async function getApplication(
  id: string,
): Promise<ApplicationDetailResponse> {
  const res = await fetch(`${base()}/applications/${id}`, {
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApplicationDetailResponse>(res);
}

export async function createApplication(
  body: CreateApplicationRequest,
): Promise<{ application: Application }> {
  const res = await fetch(`${base()}/applications`, {
    method: "POST",
    headers: getTenantHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<{ application: Application }>(res);
}

export async function updateApplication(
  id: string,
  body: UpdateApplicationRequest,
): Promise<{ application: Application }> {
  const res = await fetch(`${base()}/applications/${id}`, {
    method: "PATCH",
    headers: getTenantHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<{ application: Application }>(res);
}

export async function deleteApplication(id: string): Promise<void> {
  const res = await fetch(`${base()}/applications/${id}`, {
    method: "DELETE",
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
}
