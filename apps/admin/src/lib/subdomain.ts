export function getSubdomain(hostname?: string): string | null {
  const resolved =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : null);

  if (!resolved) return null;

  const h = resolved.toLowerCase();

  if (h.endsWith(".localhost")) {
    return h.replace(".localhost", "") || null;
  }

  if (h.endsWith(".vercel.app")) {
    // Vercel Preview: tenant is encoded as <tenant>---<deployment>.vercel.app (no nested subdomains due to *.vercel.app TLS scope).
    const firstLabel = h.split(".")[0] || "";
    return firstLabel.split("---")[0] || null;
  }

  const tenantDomain = import.meta.env.VITE_TENANT_DOMAIN;
  if (!tenantDomain) {
    throw new Error("VITE_TENANT_DOMAIN is required in production");
  }

  if (h === tenantDomain) return null;

  if (h.endsWith(`.${tenantDomain}`)) {
    return h.replace(`.${tenantDomain}`, "") || null;
  }

  return null;
}
