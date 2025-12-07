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

let _api: ReturnType<typeof hc<APIType>> | null = null;

function getClient() {
  if (!_api) {
    try {
      const apiUrl = getApiUrl();
      console.log("[API] Initializing Hono client with URL:", apiUrl);
      _api = hc<APIType>(apiUrl);
      console.log("[API] Client initialized successfully");
      console.log("[API] Client has users?", "users" in _api);
      console.log("[API] Client has companies?", "companies" in _api);
    } catch (error) {
      console.error("[API] Failed to initialize client:", error);
      throw error;
    }
  }
  return _api;
}

export const api = new Proxy({} as ReturnType<typeof hc<APIType>>, {
  get(_target, prop) {
    try {
      const client = getClient();
      const value = (client as any)[prop];

      if (value === undefined) {
        console.error(`[API] Property "${String(prop)}" not found on client`);
        console.log("[API] Available properties:", Object.keys(client));
      }

      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    } catch (error) {
      console.error(`[API] Error accessing property "${String(prop)}":`, error);
      throw error;
    }
  },
});
