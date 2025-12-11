import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "../index";
import { applications } from "../schema/applications";
import type { TenantMap } from "./types/tenantMap.type";

const applicationSeedData = [
  {
    tenantSlug: "acme",
    slug: "support-widget",
    name: "Support Widget",
    description: "Embeddable chat widget for Acme support.",
    settings: { channels: ["web"], realtime: true },
  },
  {
    tenantSlug: "globex",
    slug: "support-widget",
    name: "Support Widget",
    description: "Embeddable chat widget for Globex.",
    settings: { channels: ["web"], realtime: true },
  },
  {
    tenantSlug: "acme",
    slug: "admin-dashboard",
    name: "Admin Dashboard",
    description: "Internal admin for support ops.",
    settings: { roles: ["admin", "agent"] },
  },
];

export async function seedApplications(
  tenantMap: TenantMap,
  client = db
): Promise<{ id: string; slug: string; tenant_id: string; name: string }[]> {
  const values = applicationSeedData.map((app) => {
    const tenantId = tenantMap.get(app.tenantSlug);
    if (!tenantId) {
      throw new Error(
        `[seed] Missing tenant for slug ${app.tenantSlug} - did seedTenants run?`
      );
    }
    return {
      id: randomUUID(),
      tenantId,
      slug: app.slug,
      name: app.name,
      description: app.description,
      settings: app.settings,
    };
  });

  await client
    .insert(applications)
    .values(values)
    .onConflictDoNothing({
      target: [applications.slug, applications.tenantId],
    });

  const tenantIds = Array.from(new Set(values.map((v) => v.tenantId)));

  const rows = await client
    .select({
      id: applications.id,
      slug: applications.slug,
      tenant_id: applications.tenantId,
      name: applications.name,
    })
    .from(applications)
    .where(inArray(applications.tenantId, tenantIds));

  console.info(`[seed] applications upserted/fetched: ${rows.length}`);

  return rows;
}
