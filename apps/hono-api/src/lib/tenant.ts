import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organization } from "../db/schema/organization.js";
import { env } from "../env.js";

export function getHostSubdomain(host: string | null): string | null {
  if (!host) return null;
  const raw = host.split(",")[0]?.trim() ?? "";
  if (!raw) return null;

  const withoutPort = raw.startsWith("[")
    ? raw.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1")
    : (raw.split(":")[0] ?? "");

  const hostname = withoutPort.toLowerCase();
  if (!hostname) return null;

  const tenantDomain = env.TENANT_DOMAIN;
  if (hostname === "localhost") return null;
  if (tenantDomain && hostname === tenantDomain) return null;

  if (hostname.endsWith(".localhost")) {
    return hostname.replace(".localhost", "") || null;
  }

  if (hostname.endsWith(".vercel.app")) {
    const firstLabel = hostname.replace(".vercel.app", "").split(".")[0] || "";
    const tenant = firstLabel.split("---")[0] || null;
    return tenant;
  }

  if (tenantDomain && hostname.endsWith(`.${tenantDomain}`)) {
    return hostname.replace(`.${tenantDomain}`, "") || null;
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
