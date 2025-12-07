import type { APIType } from "hono-api/types";
import { hc } from "hono/client";

function getApiUrl(): string {
  // Priority 1: Runtime injection from SSR
  if (typeof window !== "undefined" && (window as any).__API_URL__) {
    const url = (window as any).__API_URL__;
    return url.endsWith("/api") ? url : `${url.replace(/\/$/, "")}/api`;
  }

  // Priority 2: Build-time env var (Vite replaces this)
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.endsWith("/api")
      ? envUrl
      : `${envUrl.replace(/\/$/, "")}/api`;
  }

  // Development fallback
  if (import.meta.env.DEV) {
    return "http://localhost:8000/api";
  }

  throw new Error("VITE_API_URL environment variable is not set.");
}

let _api: ReturnType<typeof hc<APIType>> | null = null;

export const api = new Proxy({} as ReturnType<typeof hc<APIType>>, {
  get(_target, prop) {
    if (!_api) {
      _api = hc<APIType>(getApiUrl());
    }
    const value = (_api as any)[prop];
    return typeof value === "function" ? value.bind(_api) : value;
  },
});
