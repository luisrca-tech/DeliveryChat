import type { APIType } from "hono-api/types";
import { hc } from "hono/client";

function getApiUrl(): string {
  // Server-side: use process.env (available during SSR)
  if (typeof window === "undefined") {
    if (process.env.VITE_API_URL) {
      const baseUrl = process.env.VITE_API_URL;
      return baseUrl.endsWith("/api")
        ? baseUrl
        : `${baseUrl.replace(/\/$/, "")}/api`;
    }
    if (process.env.PUBLIC_API_URL) {
      const baseUrl = process.env.PUBLIC_API_URL;
      return baseUrl.endsWith("/api")
        ? baseUrl
        : `${baseUrl.replace(/\/$/, "")}/api`;
    }
    // Server-side fallback for development
    if (process.env.NODE_ENV === "development" || !process.env.VERCEL) {
      return "http://localhost:8000/api";
    }
  }

  // Client-side: Priority 1 - Runtime injection from SSR (most reliable)
  if (typeof window !== "undefined") {
    if ((window as any).__API_URL__) {
      const injectedUrl = (window as any).__API_URL__;
      return injectedUrl.endsWith("/api")
        ? injectedUrl
        : `${injectedUrl.replace(/\/$/, "")}/api`;
    }

    // Priority 2 - Build-time env var (Vite replaces this at build time)
    if (import.meta.env.VITE_API_URL) {
      const baseUrl = import.meta.env.VITE_API_URL;
      return baseUrl.endsWith("/api")
        ? baseUrl
        : `${baseUrl.replace(/\/$/, "")}/api`;
    }

    // Priority 3 - Development fallback
    if (import.meta.env.DEV || import.meta.env.MODE === "development") {
      return "http://localhost:8000/api";
    }
  }

  // If we get here, we couldn't find the API URL
  // This should not happen if SSR injection is working correctly
  throw new Error(
    "VITE_API_URL environment variable is not set. Please configure it in Vercel. " +
      "If using Infisical, ensure the variable is synced to Vercel environment variables."
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
