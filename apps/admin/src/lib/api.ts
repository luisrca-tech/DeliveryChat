import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

function getApiUrl(): string {
  const isServer = typeof window === "undefined";
  const context = isServer ? "[SERVER]" : "[CLIENT]";

  // Server-side: use process.env (VITE_ prefixed vars are client-only in env.ts)
  if (isServer) {
    console.log(`${context} getApiUrl() called on server`);
    const serverUrl = process.env.VITE_API_URL;
    console.log(
      `${context} process.env.VITE_API_URL:`,
      serverUrl ? "✓ Set" : "✗ Not set"
    );

    if (serverUrl) {
      const url = serverUrl.endsWith("/api")
        ? serverUrl
        : `${serverUrl.replace(/\/$/, "")}/api`;
      console.log(`${context} ✓ Using server process.env:`, url);
      return url;
    }

    if (env.NODE_ENV === "development") {
      const devUrl = "http://localhost:8000/api";
      console.log(`${context} ✓ Using dev fallback:`, devUrl);
      return devUrl;
    }

    console.error(
      `${context} ✗ VITE_API_URL not set on server and not in dev mode`
    );
    throw new Error("VITE_API_URL not set on server");
  }

  // Client-side: Priority 1 - Runtime injection from SSR
  console.log(`${context} getApiUrl() called on client`);
  const injectedUrl = (window as any).__API_URL__;
  console.log(`${context} window.__API_URL__:`, injectedUrl || "✗ Not set");

  if (injectedUrl) {
    const url = injectedUrl.endsWith("/api")
      ? injectedUrl
      : `${injectedUrl.replace(/\/$/, "")}/api`;
    console.log(`${context} ✓ Using SSR injected URL:`, url);
    return url;
  }

  // Priority 2: Build-time env var (Vite replaces this at build time)
  const envUrl = import.meta.env.VITE_API_URL;
  console.log(
    `${context} import.meta.env.VITE_API_URL:`,
    envUrl ? "✓ Set" : "✗ Not set"
  );

  if (envUrl) {
    const url = envUrl.endsWith("/api")
      ? envUrl
      : `${envUrl.replace(/\/$/, "")}/api`;
    console.log(`${context} ✓ Using build-time env var:`, url);
    return url;
  }

  // Development fallback
  if (import.meta.env.DEV) {
    const devUrl = "http://localhost:8000/api";
    console.log(`${context} ✓ Using dev fallback:`, devUrl);
    return devUrl;
  }

  console.error(`${context} ✗ No API URL available!`);
  throw new Error("VITE_API_URL environment variable is not set.");
}

let _api: ReturnType<typeof hc<APIType>> | null = null;

export const api = new Proxy({} as ReturnType<typeof hc<APIType>>, {
  get(_target, prop) {
    if (!_api) {
      console.log("[API] Initializing API client...");
      const apiUrl = getApiUrl();
      console.log("[API] Created client with URL:", apiUrl);
      _api = hc<APIType>(apiUrl);
    }
    const value = (_api as any)[prop];
    return typeof value === "function" ? value.bind(_api) : value;
  },
});
