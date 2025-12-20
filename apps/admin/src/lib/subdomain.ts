export function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  const hostname = window.location.hostname.toLowerCase();
  if (!hostname) return null;

  if (hostname === "localhost") return null;
  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    return parts.length > 1 ? (parts[0] ?? null) : null;
  }

  if (hostname.endsWith(".deliverychat.com")) {
    const parts = hostname.split(".");
    return parts.length > 2 ? (parts[0] ?? null) : null;
  }

  return null;
}
