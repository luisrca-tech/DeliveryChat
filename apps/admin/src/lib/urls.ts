import { getSubdomain } from "./subdomain";

export function isDevelopment(): boolean {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

function normalizeApiTemplate(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function applyTenantToApiTemplate(template: string, tenant: string): string {
  const normalized = normalizeApiTemplate(template);

  if (normalized.includes("[tenant]")) {
    return normalized.replaceAll("[tenant]", tenant);
  }
  if (normalized.includes("<tenant>")) {
    return normalized.replaceAll("<tenant>", tenant);
  }

  return normalized;
}

export function getApiUrl(): string {
  const rawTemplate = import.meta.env.VITE_API_URL as string | undefined;
  if (!rawTemplate) {
    throw new Error("VITE_API_URL is required");
  }

  if (import.meta.env.DEV) {
    const devApiUrl = (() => {
      if (typeof window === "undefined") return "http://localhost:8000";
      const hostname = window.location.hostname.toLowerCase();
      if (hostname.endsWith(".localhost") && hostname !== "localhost") {
        return `http://${hostname}:8000`;
      }
      return "http://localhost:8000";
    })();

    return devApiUrl;
  }

  if (typeof window === "undefined") {
    return normalizeApiTemplate(rawTemplate);
  }

  const hostname = window.location.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return "http://localhost:8000";
  }

  const tenant = getSubdomain(hostname);
  if (!tenant) {
    throw new Error("Tenant subdomain is required to build Admin API URL");
  }

  if (hostname.endsWith(".vercel.app")) {
    const devTemplate = normalizeApiTemplate(rawTemplate).replace(
      ".api.deliverychat.online",
      ".api-dev.deliverychat.online"
    );
    return applyTenantToApiTemplate(devTemplate, tenant);
  }

  return applyTenantToApiTemplate(rawTemplate, tenant);
}

export function getApiBaseUrl(): string {
  const baseUrl = getApiUrl();
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

export function getSubdomainOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export function getSubdomainUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const origin = getSubdomainOrigin();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${cleanPath}`;
}
