import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "../index";
import { organization } from "../schema/organization";
import { tenantSeedData } from "./constants/tenantSeedData";
import type { TenantMap } from "./types/tenantMap.type";

export async function seedTenants(client = db): Promise<TenantMap> {
  const slugList = tenantSeedData.map((t) => t.slug);

  await client
    .insert(organization)
    .values(
      tenantSeedData.map((tenant) => ({
        id: randomUUID(),
        slug: tenant.slug,
        name: tenant.name,
        description: tenant.description,
        settings: tenant.settings,
        plan: tenant.plan,
      })),
    )
    .onConflictDoNothing({ target: organization.slug });

  const rows = await client
    .select({
      id: organization.id,
      slug: organization.slug,
    })
    .from(organization)
    .where(inArray(organization.slug, slugList));

  const tenantMap: TenantMap = new Map();
  for (const row of rows) {
    tenantMap.set(row.slug, row.id);
  }

  console.info(`[seed] tenants upserted/fetched: ${tenantMap.size}`);

  return tenantMap;
}
