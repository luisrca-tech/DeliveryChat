import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { getSubdomain } from "./subdomain.js";
import { getApiBaseUrl } from "./urls.js";

export const api = hc<APIType>(getApiBaseUrl(), {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? {});
    const tenant = typeof window !== "undefined" ? getSubdomain() : null;
    if (tenant && !headers.has("X-Tenant-Slug")) {
      headers.set("X-Tenant-Slug", tenant);
    }

    return fetch(input, {
      ...init,
      headers,
      credentials: init?.credentials ?? "include",
    });
  },
});
