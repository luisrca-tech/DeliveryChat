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
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:8000";
    }
  }
  return (
    import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:8000"
  );
}

export function getApiBaseUrl(): string {
  const baseUrl = getApiUrl();
  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}
