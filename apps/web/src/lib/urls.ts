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

  if (typeof window === "undefined") {
    if (!env.PUBLIC_TENANT_DOMAIN) {
      throw new Error("PUBLIC_TENANT_DOMAIN is required to build admin URL");
    }
    return `https://${safeTenant}.${env.PUBLIC_TENANT_DOMAIN}`;
  }

  const hostname = window.location.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return `http://${safeTenant}.localhost:3000`;
  }

  if (!env.PUBLIC_TENANT_DOMAIN) {
    throw new Error("PUBLIC_TENANT_DOMAIN is required to build admin URL");
  }
  return `https://${safeTenant}.${env.PUBLIC_TENANT_DOMAIN}`;
}

export function getApiUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:8000";
  }
  return env.PUBLIC_API_URL.replace(/\/+$/, "");
}
