import { HTTP_STATUS } from "@repo/types";
import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  Application,
  ApplicationsListResponse,
  ApplicationDetailResponse,
  CreateApplicationRequest,
  UpdateApplicationRequest,
} from "../types/applications.types";

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
  if (
    res.status === HTTP_STATUS.FORBIDDEN &&
    err?.error === "origin_not_allowed"
  ) {
    throw new OriginNotAllowedError(message);
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

export class OriginNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriginNotAllowedError";
  }
}

const base = () => getApiBaseUrl();

export async function listApplications(
  limit = 100,
  offset = 0,
  options?: { hasMyConversations?: boolean },
): Promise<ApplicationsListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (options?.hasMyConversations) params.set("hasMyConversations", "true");

  const res = await fetch(`${base()}/applications?${params}`, {
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApplicationsListResponse>(res);
}

export async function getApplication(
  id: string,
): Promise<ApplicationDetailResponse> {
  const res = await fetch(`${base()}/applications/${id}`, {
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ApplicationDetailResponse>(res);
}

export async function createApplication(
  body: CreateApplicationRequest,
): Promise<{ application: Application }> {
  const res = await fetch(`${base()}/applications`, {
    method: "POST",
    headers: getTenantHeaders({ json: true }),
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
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<{ application: Application }>(res);
}

export async function deleteApplication(id: string): Promise<void> {
  const res = await fetch(`${base()}/applications/${id}`, {
    method: "DELETE",
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) throw await handleError(res);
}
