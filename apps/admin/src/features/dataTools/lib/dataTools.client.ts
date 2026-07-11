import { HTTP_STATUS } from "@repo/types";
import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  DataSourceBody,
  DataTool,
  DataToolBody,
  RedactedDataSource,
  TestDataToolResult,
} from "../types/dataTools.types";

const base = () => getApiBaseUrl();

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * The AI database-connection feature is gated to ENTERPRISE-custom tenants
 * with the AI add-on active (`requireAiDbFeature` on hono-api). Thrown
 * instead of a generic error so the UI can render a dedicated locked-state
 * card rather than an error toast.
 */
export class DataToolsFeatureLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataToolsFeatureLockedError";
  }
}

export class DataToolNameConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataToolNameConflictError";
  }
}

export class DataToolsClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(args: { code: string; status: number; message: string }) {
    super(args.message);
    this.name = "DataToolsClientError";
    this.code = args.code;
    this.status = args.status;
  }
}

async function handleError(res: Response): Promise<never> {
  const err = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  const isServerError = res.status >= 500;
  const message = isServerError
    ? "Something went wrong. Please try again."
    : (err?.message ?? err?.error ?? `Request failed (${res.status})`);

  if (
    res.status === HTTP_STATUS.FORBIDDEN &&
    err?.error === "ai_db_feature_not_available"
  ) {
    throw new DataToolsFeatureLockedError(message);
  }
  if (res.status === HTTP_STATUS.CONFLICT) {
    throw new DataToolNameConflictError(message);
  }

  throw new DataToolsClientError({
    code: err?.error ?? "unknown_error",
    status: res.status,
    message,
  });
}

export async function getDataSource(
  applicationId: string,
): Promise<RedactedDataSource | null> {
  const res = await fetch(`${base()}/applications/${applicationId}/data-source`, {
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<RedactedDataSource | null>(res);
}

export async function putDataSource(
  applicationId: string,
  body: DataSourceBody,
): Promise<RedactedDataSource> {
  const res = await fetch(`${base()}/applications/${applicationId}/data-source`, {
    method: "PUT",
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<RedactedDataSource>(res);
}

export async function listDataTools(
  applicationId: string,
): Promise<DataTool[]> {
  const res = await fetch(`${base()}/applications/${applicationId}/data-tools`, {
    headers: getTenantHeaders({ json: true }),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<DataTool[]>(res);
}

export async function createDataTool(
  applicationId: string,
  body: DataToolBody,
): Promise<DataTool> {
  const res = await fetch(`${base()}/applications/${applicationId}/data-tools`, {
    method: "POST",
    headers: getTenantHeaders({ json: true }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<DataTool>(res);
}

export async function updateDataTool(
  applicationId: string,
  toolId: string,
  body: DataToolBody,
): Promise<DataTool> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/data-tools/${toolId}`,
    {
      method: "PUT",
      headers: getTenantHeaders({ json: true }),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw await handleError(res);
  return parseJson<DataTool>(res);
}

export async function deleteDataTool(
  applicationId: string,
  toolId: string,
): Promise<void> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/data-tools/${toolId}`,
    {
      method: "DELETE",
      headers: getTenantHeaders({ json: true }),
    },
  );
  if (!res.ok) throw await handleError(res);
}

export async function testDataTool(
  applicationId: string,
  toolId: string,
  params: Record<string, unknown>,
): Promise<TestDataToolResult> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/data-tools/${toolId}/test`,
    {
      method: "POST",
      headers: getTenantHeaders({ json: true }),
      body: JSON.stringify({ params }),
    },
  );
  if (!res.ok) throw await handleError(res);
  return parseJson<TestDataToolResult>(res);
}

export async function setDataToolEnabled(
  applicationId: string,
  toolId: string,
  enabled: boolean,
): Promise<DataTool> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/data-tools/${toolId}/enable`,
    {
      method: "POST",
      headers: getTenantHeaders({ json: true }),
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) throw await handleError(res);
  return parseJson<DataTool>(res);
}
