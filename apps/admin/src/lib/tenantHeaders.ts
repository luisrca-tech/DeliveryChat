import { getSubdomain } from "./subdomain";
import { getBearerToken } from "./bearerToken";

type TenantHeadersOptions = {
  json?: boolean;
};

export function getTenantHeaders(
  options?: TenantHeadersOptions,
): HeadersInit {
  const tenant = getSubdomain();
  const token = getBearerToken();

  const headers: Record<string, string> = {};

  if (options?.json) {
    headers["Content-Type"] = "application/json";
  }
  if (tenant) {
    headers["X-Tenant-Slug"] = tenant;
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

