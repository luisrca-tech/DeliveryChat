import type { APIType } from "hono-api/types";
import { hc } from "hono/client";

function getApiUrl(): string {
  if (typeof window !== "undefined" && (window as any).__API_URL__) {
    return (window as any).__API_URL__;
  }

  if (import.meta.env.PUBLIC_API_URL) {
    const baseUrl = import.meta.env.PUBLIC_API_URL;
    return baseUrl.endsWith("/api")
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/api`;
  }

  return "http://localhost:8000/api";
}

const apiUrl = getApiUrl();
console.log("API URL:", apiUrl);

export const api = hc<APIType>(apiUrl);
