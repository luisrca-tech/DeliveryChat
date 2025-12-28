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
  const safeTenant = tenant.toLowerCase().trim();

  if (isDevelopment()) {
    return `http://${safeTenant}.localhost:3000`;
  }

  const base = env.PUBLIC_ADMIN_URL;
  if (!base) {
    throw new Error("PUBLIC_ADMIN_URL is required (admin root without tenant)");
  }

  const url = new URL(base);
  const host = url.hostname;
  if (host.endsWith(".vercel.app")) {
    // Vercel Preview: use URL prefixes (<tenant>---<deployment>.vercel.app) because *.vercel.app TLS doesn't cover nested subdomains.
    return `${url.protocol}//${safeTenant}---${host}`;
  }
  return `${url.protocol}//${safeTenant}.${host}`;
}

export function getApiUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:8000";
  }
  return env.PUBLIC_API_URL.replace(/\/+$/, "");
}
