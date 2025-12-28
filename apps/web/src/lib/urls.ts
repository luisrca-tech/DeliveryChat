import { env } from "../env.js";

export function isDevelopment(): boolean {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

export function getAdminUrl(tenant: string): string {
  const base = env.PUBLIC_ADMIN_URL;
  if (!base) {
    throw new Error("PUBLIC_ADMIN_URL is required (admin root without tenant)");
  }

  const safeTenant = tenant.toLowerCase().trim();

  const url = new URL(base);

  if (url.hostname === "localhost") {
    return `http://${safeTenant}.localhost:3000`;
  }

  return `${url.protocol}//${safeTenant}.${url.hostname}`;
}

export function getApiUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:8000";
  }
  return env.PUBLIC_API_URL.replace(/\/+$/, "");
}
