import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker";
import { inArray } from "drizzle-orm";
import { db } from "../index";
import { applications } from "../schema/applications";
import type { TenantMap } from "./types/tenantMap.type";

const APPS_PER_TENANT = 5;

function buildApplicationSeedValues(tenantMap: TenantMap) {
  const values: {
    id: string;
    tenantId: string;
    slug: string;
    subdomain: string;
    name: string;
    description: string;
    settings: Record<string, unknown>;
  }[] = [];

  for (const [tenantSlug, tenantId] of tenantMap.entries()) {
    for (let i = 0; i < APPS_PER_TENANT; i++) {
      const slugFragment = faker.string.alphanumeric(6).toLowerCase();
      const slug = `${tenantSlug}-${slugFragment}`;
      values.push({
        id: randomUUID(),
        tenantId,
        slug,
        subdomain: `${slug}.widget`,
        name: faker.commerce.productName(),
        description: faker.company.catchPhrase(),
        settings: {},
      });
    }
  }

  return values;
}

export async function seedApplications(
  tenantMap: TenantMap,
  client = db
): Promise<{ id: string; slug: string; tenant_id: string; name: string }[]> {
  const values = buildApplicationSeedValues(tenantMap);

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
      subdomain: applications.subdomain,
    })
    .from(applications)
    .where(inArray(applications.tenantId, tenantIds));

  console.info(`[seed] applications upserted/fetched: ${rows.length}`);

  return rows;
}
