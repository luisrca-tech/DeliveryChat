import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker";
import { inArray } from "drizzle-orm";
import { db } from "../index";
import { companies } from "../schema/companies";
import type { TenantMap } from "./types/tenantMap.type";

const COMPANIES_PER_TENANT = 10;

function buildCompanySeedValues(tenantMap: TenantMap) {
  const values: {
    id: string;
    tenantId: string;
    name: string;
    subdomain: string;
    description: string;
    settings: Record<string, unknown>;
  }[] = [];

  for (const [tenantSlug, tenantId] of tenantMap.entries()) {
    for (let i = 0; i < COMPANIES_PER_TENANT; i++) {
      const name = faker.company.name();
      const slugFragment = faker.string.alphanumeric(6).toLowerCase();
      const subdomain = `${tenantSlug}-${slugFragment}`;

      values.push({
        id: randomUUID(),
        tenantId,
        name,
        subdomain,
        description: faker.company.catchPhrase(),
        settings: { region: faker.location.timeZone() },
      });
    }
  }

  return values;
}

export async function seedCompanies(
  tenantMap: TenantMap,
  client = db
): Promise<{ id: string; tenant_id: string; name: string }[]> {
  const values = buildCompanySeedValues(tenantMap);

  await client
    .insert(companies)
    .values(values)
    .onConflictDoNothing({ target: companies.subdomain });

  const tenantIds = Array.from(new Set(values.map((v) => v.tenantId)));

  const rows = await client
    .select({
      id: companies.id,
      tenant_id: companies.tenantId,
      name: companies.name,
    })
    .from(companies)
    .where(inArray(companies.tenantId, tenantIds));

  console.info(`[seed] companies upserted/fetched: ${rows.length}`);

  return rows;
}
