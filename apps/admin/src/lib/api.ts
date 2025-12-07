import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

function getApiUrl(): string {
  const isServer = typeof window === "undefined";

  if (isServer) {
    const serverUrl = import.meta.env.VITE_API_URL;
    if (serverUrl) {
      return serverUrl.endsWith("/api")
        ? serverUrl
        : `${serverUrl.replace(/\/$/, "")}/api`;
    }

    if (env.NODE_ENV === "development") {
      return "http://localhost:8000/api";
    }

    throw new Error("VITE_API_URL not set on server");
  }

  const injectedUrl = (window as any).__API_URL__;
  if (injectedUrl) {
    return injectedUrl.endsWith("/api")
      ? injectedUrl
      : `${injectedUrl.replace(/\/$/, "")}/api`;
  }

  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.endsWith("/api")
      ? envUrl
      : `${envUrl.replace(/\/$/, "")}/api`;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:8000/api";
  }

  throw new Error("VITE_API_URL environment variable is not set.");
}

let _api: ReturnType<typeof hc<APIType>> | null = null;

export const api = new Proxy({} as ReturnType<typeof hc<APIType>>, {
  get(_target, prop) {
    if (!_api) {
      const apiUrl = getApiUrl();
      _api = hc<APIType>(apiUrl);
    }
    const value = (_api as any)[prop];
    return typeof value === "function" ? value.bind(_api) : value;
  },
});
