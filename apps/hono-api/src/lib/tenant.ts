import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organization } from "../db/schema/organization.js";

export function getHostSubdomain(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname) return null;

  // local dev: {tenant}.localhost
  if (hostname === "localhost") return null;
  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    return parts.length > 1 ? (parts[0] ?? null) : null;
  }

  // production: {tenant}.deliverychat.com
  if (hostname.endsWith(".deliverychat.com")) {
    const parts = hostname.split(".");
    return parts.length > 2 ? (parts[0] ?? null) : null;
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
