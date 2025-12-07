import type { APIType } from "hono-api/types";
import { hc } from "hono/client";

function getApiUrl(): string {
  if (typeof window !== "undefined" && (window as any).__API_URL__) {
    const injectedUrl = (window as any).__API_URL__;
    return injectedUrl.endsWith("/api")
      ? injectedUrl
      : `${injectedUrl.replace(/\/$/, "")}/api`;
  }

  if (import.meta.env.VITE_API_URL) {
    const baseUrl = import.meta.env.VITE_API_URL;
    return baseUrl.endsWith("/api")
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/api`;
  }

  if (import.meta.env.DEV || import.meta.env.MODE === "development") {
    return "http://localhost:8000/api";
  }

  throw new Error(
    "VITE_API_URL environment variable is not set. Please configure it in Vercel."
  );
}

let apiClient: ReturnType<typeof hc<APIType>> | null = null;

function getApiClient() {
  if (!apiClient) {
    const apiUrl = getApiUrl();
    console.log("API URL:", apiUrl);
    apiClient = hc<APIType>(apiUrl);
  }
  return apiClient;
}

export const api = new Proxy({} as ReturnType<typeof hc<APIType>>, {
  get(_target, prop) {
    const client = getApiClient();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
