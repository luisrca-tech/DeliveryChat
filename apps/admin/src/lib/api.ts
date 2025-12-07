import type { APIType } from "hono-api/types";
import { hc } from "hono/client";

function getApiUrl(): string {
  // Priority 1: Runtime injection from SSR (most reliable)
  if (typeof window !== "undefined" && (window as any).__API_URL__) {
    const injectedUrl = (window as any).__API_URL__;
    return injectedUrl.endsWith("/api")
      ? injectedUrl
      : `${injectedUrl.replace(/\/$/, "")}/api`;
  }

  // Priority 2: Build-time env var
  if (import.meta.env.VITE_API_URL) {
    const baseUrl = import.meta.env.VITE_API_URL;
    return baseUrl.endsWith("/api")
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/api`;
  }

  // Only use localhost for local development (when actually running locally)
  if (import.meta.env.DEV || import.meta.env.MODE === "development") {
    return "http://localhost:8000/api";
  }

  // If no env var is set in production, throw an error
  throw new Error(
    "VITE_API_URL environment variable is not set. Please configure it in Vercel."
  );
}

const apiUrl = getApiUrl();
console.log("API URL:", apiUrl);

export const api = hc<APIType>(apiUrl);
