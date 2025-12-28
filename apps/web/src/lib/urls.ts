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

function isPreview(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith(".vercel.app");
}

export function getAdminUrl(subdomain: string): string {
  if (isDevelopment()) {
    return `http://${subdomain}.localhost:3000`;
  }

  if (isPreview()) {
    return `https://${subdomain}.${window.location.hostname}`;
  }

  const tenantDomain = env.PUBLIC_TENANT_DOMAIN;
  if (!tenantDomain) {
    throw new Error("PUBLIC_TENANT_DOMAIN is required in production");
  }

  return `https://${subdomain}.${tenantDomain}`;
}

export function getApiUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:8000";
  }
  return env.PUBLIC_API_URL.replace(/\/+$/, "");
}
