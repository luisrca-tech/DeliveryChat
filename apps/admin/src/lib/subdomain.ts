export function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  const hostname = window.location.hostname.toLowerCase();
  if (!hostname) return null;

  // Local
  if (hostname.endsWith(".localhost")) {
    return hostname.replace(".localhost", "") || null;
  }

  // Preview (Vercel)
  if (hostname.endsWith(".vercel.app")) {
    return hostname.split(".")[0] || null;
  }

  // Production
  const tenantDomain = import.meta.env.VITE_TENANT_DOMAIN;
  if (!tenantDomain) {
    throw new Error("VITE_TENANT_DOMAIN is required in production");
  }

  if (hostname === tenantDomain) return null;

  if (hostname.endsWith(`.${tenantDomain}`)) {
    return hostname.replace(`.${tenantDomain}`, "") || null;
  }

  return null;
}
