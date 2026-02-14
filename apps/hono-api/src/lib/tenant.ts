import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organization } from "../db/schema/organization.js";

function stripPort(host: string): string {
  const raw = host.split(",")[0]?.trim() ?? "";
  if (!raw) return "";

  if (raw.startsWith("[")) {
    return raw.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1");
  }

  return raw.split(":")[0] ?? "";
}

export function getHostSubdomain(host: string | null): string | null {
  if (!host) return null;
  const hostname = stripPort(host).toLowerCase();
  if (!hostname) return null;

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    return hostname.slice(0, -".localhost".length) || null;
  }

  if (hostname.endsWith(".vercel.app")) {
    const firstLabel = hostname.replace(".vercel.app", "").split(".")[0] || "";
    const tenant = firstLabel.split("---")[0] || null;
    return tenant || null;
  }

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) return null;

  const first = labels[0] ?? "";
  if (!first) return null;

  if (first === "api" || first === "api-dev" || first === "www") return null;

  return first;
}

export async function resolveOrganizationBySubdomain(slug: string) {
  const rows = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);

  return rows[0] ?? null;
}
