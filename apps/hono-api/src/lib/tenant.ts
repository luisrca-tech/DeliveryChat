import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organization } from "../db/schema/organization.js";
import { env } from "../env.js";

export function getHostSubdomain(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname) return null;

  const tenantDomain = env.TENANT_DOMAIN;
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

export async function resolveOrganizationBySubdomain(slug: string) {
  const rows = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);

  return rows[0] ?? null;
}
