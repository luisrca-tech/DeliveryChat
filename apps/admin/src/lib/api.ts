import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

const normalizeBaseUrl = (url: string) => {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

const baseUrl = normalizeBaseUrl(env.VITE_API_URL);

console.info("[admin] API base URL:", baseUrl);

export const api = hc<APIType>(baseUrl);
