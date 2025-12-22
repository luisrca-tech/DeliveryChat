export function isDevelopment(): boolean {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

export function getApiUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:8000";
  }
  return (
    import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:8000"
  );
}

export function getApiBaseUrl(): string {
  const baseUrl = getApiUrl();
  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
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

export function getWebAppUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:3002";
  }
  return "https://delivery-chat-admin.vercel.app";
}
