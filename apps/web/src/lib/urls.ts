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

function normalizeUrl(raw: string | undefined): string {
  if (!raw) {
    throw new Error("URL is required but was not provided");
  }

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

const RESERVED_ADMIN_HOST_PREFIXES = ["api.", "api-dev.", "www."] as const;

function assertAdminHostNotReserved(host: string): void {
  const reserved = RESERVED_ADMIN_HOST_PREFIXES.find((prefix) =>
    host.toLowerCase().startsWith(prefix),
  );
  if (reserved) {
    throw new Error(
      `PUBLIC_ADMIN_URL points at a reserved subdomain ("${reserved.slice(0, -1)}"). It must resolve to the admin app, not the API.`,
    );
  }
}

export function getAdminUrl(tenant: string): string {
  const safeTenant = tenant.toLowerCase().trim();
  const adminUrl = import.meta.env.PUBLIC_ADMIN_URL as string | undefined;

  if (
    typeof window === "undefined" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith(".localhost")
  ) {
    return `http://${safeTenant}.localhost:3000`;
  }

  if (!adminUrl) {
    throw new Error("PUBLIC_ADMIN_URL is required to build admin URL");
  }

  const templated = applyTenantToTemplate(adminUrl, safeTenant);
  if (templated !== normalizeUrl(adminUrl)) {
    const resolved = new URL(templated);
    assertAdminHostNotReserved(resolved.host);
    return templated;
  }
  const base = new URL(normalizeUrl(adminUrl));
  assertAdminHostNotReserved(base.host);
  return `${base.protocol}//${safeTenant}.${base.host}`;
}

export function getApiUrl(): string {
  const publicApiUrl = import.meta.env.PUBLIC_API_URL ?? env.PUBLIC_API_URL;

  if (import.meta.env.DEV || isDevelopment() || !publicApiUrl) {
    return "http://localhost:8000";
  }

  return normalizeUrl(publicApiUrl);
}

const DOCS_URL_LOCAL = "http://localhost:3003";
const DOCS_URL_PRODUCTION = "https://docs.deliverychat.online/";

export function getDocumentationUrl(): string {
  if (import.meta.env.DEV) {
    return DOCS_URL_LOCAL;
  }

  if (typeof window !== "undefined" && isDevelopment()) {
    return DOCS_URL_LOCAL;
  }

  return DOCS_URL_PRODUCTION;
}
