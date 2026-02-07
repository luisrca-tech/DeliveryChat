export function isDevelopment(): boolean {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

function normalizeApiUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function getApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (!raw) {
    throw new Error("VITE_API_URL is required");
  }

  if (import.meta.env.DEV) {
    if (typeof window === "undefined") return "http://localhost:8000";

    const hostname = window.location.hostname.toLowerCase();
    if (hostname.endsWith(".localhost") && hostname !== "localhost") {
      return `http://${hostname}:8000`;
    }

    return "http://localhost:8000";
  }

  if (typeof window === "undefined") {
    return normalizeApiUrl(raw);
  }

  const hostname = window.location.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return "http://localhost:8000";
  }

  return normalizeApiUrl(raw);
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
