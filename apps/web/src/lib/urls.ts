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
  return `https://${subdomain}.deliverychat.com`;
}

export function getApiUrl(): string {
  if (isDevelopment()) {
    return "http://localhost:8000";
  }
  return (
    import.meta.env.PUBLIC_API_URL?.replace(/\/+$/, "") ||
    "http://localhost:8000"
  );
}
