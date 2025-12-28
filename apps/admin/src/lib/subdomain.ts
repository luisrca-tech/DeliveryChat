export function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  const hostname = window.location.hostname.toLowerCase();
  if (!hostname) return null;

  const tenantDomain = import.meta.env.VITE_TENANT_DOMAIN;
  if (!tenantDomain && !hostname.endsWith(".vercel.app")) return null;
  if (hostname === tenantDomain || hostname === "localhost") return null;

  if (hostname.endsWith(".localhost")) {
    return hostname.replace(".localhost", "") || null;
  }

  if (hostname.endsWith(".vercel.app")) {
    return hostname.split(".")[0] || null;
  }

  if (tenantDomain && hostname.endsWith(`.${tenantDomain}`)) {
    return hostname.replace(`.${tenantDomain}`, "") || null;
  }

  return null;
}
