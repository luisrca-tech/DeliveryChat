export function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  const hostname = window.location.hostname;

  if (hostname.includes("localhost")) {
    const parts = hostname.split(".");
    if (parts.length > 1 && parts[0] && parts[0] !== "localhost") {
      return parts[0];
    }
    return null;
  }

  const parts = hostname.split(".");
  if (parts.length > 2 && parts[0]) {
    return parts[0];
  }

  return null;
}
