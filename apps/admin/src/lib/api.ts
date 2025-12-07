import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

function getApiUrl(): string {
  const isServer = typeof window === "undefined";

  if (isServer) {
    const serverUrl = env.VITE_API_URL;
    if (serverUrl) {
      const url = serverUrl.endsWith("/api")
        ? serverUrl
        : `${serverUrl.replace(/\/$/, "")}/api`;
      console.log("[API] Server-side URL:", url);
      return url;
    }

    if (env.NODE_ENV === "development") {
      const devUrl = "http://localhost:8000/api";
      console.log("[API] Using dev fallback:", devUrl);
      return devUrl;
    }

    throw new Error("VITE_API_URL not set on server");
  }

  const injectedUrl = (window as any).__API_URL__;
  if (injectedUrl) {
    const url = injectedUrl.endsWith("/api")
      ? injectedUrl
      : `${injectedUrl.replace(/\/$/, "")}/api`;
    console.log("[API] Client-side injected URL:", url);
    return url;
  }

  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    const url = envUrl.endsWith("/api")
      ? envUrl
      : `${envUrl.replace(/\/$/, "")}/api`;
    console.log("[API] Client-side env URL:", url);
    return url;
  }

  if (import.meta.env.DEV) {
    const devUrl = "http://localhost:8000/api";
    console.log("[API] Using dev fallback:", devUrl);
    return devUrl;
  }

  throw new Error("VITE_API_URL environment variable is not set.");
}

// Initialize client immediately
const apiUrl = getApiUrl();
console.log("[API] Initializing Hono client with URL:", apiUrl);

export const api = hc<APIType>(apiUrl);
