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

function normalizeUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function applyTenantToTemplate(template: string, tenant: string): string {
  const normalized = normalizeUrl(template);
  if (normalized.includes("[tenant]")) {
    return normalized.replaceAll("[tenant]", tenant);
  }
  if (normalized.includes("<tenant>")) {
    return normalized.replaceAll("<tenant>", tenant);
  }
  return normalized;
}

export function getAdminUrl(tenant: string): string {
  const safeTenant = tenant.toLowerCase().trim();

  if (typeof window === "undefined") {
    if (!env.PUBLIC_ADMIN_URL) {
      throw new Error("PUBLIC_ADMIN_URL is required to build admin URL");
    }
    const templated = applyTenantToTemplate(env.PUBLIC_ADMIN_URL, safeTenant);
    if (templated !== normalizeUrl(env.PUBLIC_ADMIN_URL)) {
      return templated;
    }
    const base = new URL(normalizeUrl(env.PUBLIC_ADMIN_URL));
    return `${base.protocol}//${safeTenant}.${base.host}`;
  }

  const hostname = window.location.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return `http://${safeTenant}.localhost:3000`;
  }

  if (!env.PUBLIC_ADMIN_URL) {
    throw new Error("PUBLIC_ADMIN_URL is required to build admin URL");
  }

  const templated = applyTenantToTemplate(env.PUBLIC_ADMIN_URL, safeTenant);
  if (templated !== normalizeUrl(env.PUBLIC_ADMIN_URL)) {
    return templated;
  }
  const base = new URL(normalizeUrl(env.PUBLIC_ADMIN_URL));
  return `${base.protocol}//${safeTenant}.${base.host}`;
}

export function getApiUrl(): string {
  if (import.meta.env.DEV || isDevelopment()) {
    return "http://localhost:8000";
  }

  return normalizeUrl(env.PUBLIC_API_URL);
}
