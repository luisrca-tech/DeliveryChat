export function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  const hostname = window.location.hostname.toLowerCase();
  if (!hostname) return null;

  const tenantDomain = import.meta.env.VITE_TENANT_DOMAIN;
  if (!tenantDomain && !hostname.endsWith(".vercel.app")) return null;
  if (hostname === tenantDomain || hostname === "localhost") return null;

  if (tenantDomain && hostname.endsWith(`.${tenantDomain}`)) {
    const tenant = hostname.replace(`.${tenantDomain}`, "");
    return tenant || null;
  }

  if (hostname.endsWith(".vercel.app")) {
    const withoutSuffix = hostname.replace(".vercel.app", "");
    const parts = withoutSuffix.split(".");
    return parts[0] || null;
  }

  if (hostname.endsWith(".localhost")) {
    const tenant = hostname.replace(".localhost", "");
    return tenant || null;
  }

  return null;
}
