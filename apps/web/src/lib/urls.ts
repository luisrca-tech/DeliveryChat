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

export function getAdminUrl(subdomain: string): string {
  if (isDevelopment()) {
    return `http://${subdomain}.localhost:3000`;
  }

  if (env.PUBLIC_TENANT_DOMAIN) {
    return `https://${subdomain}.${env.PUBLIC_TENANT_DOMAIN}`;
  }

  const baseUrl = env.PUBLIC_ADMIN_BASE_URL.replace(/\/+$/, "");
  if (baseUrl.includes("{subdomain}")) {
    return baseUrl.replace("{subdomain}", subdomain);
  }

  return baseUrl;
}

export function getApiUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:8000";
  }
  return env.PUBLIC_API_URL.replace(/\/+$/, "");
}
