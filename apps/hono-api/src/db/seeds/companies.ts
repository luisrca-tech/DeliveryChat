import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "../index";
import { companies } from "../schema/companies";
import type { TenantMap } from "./types/tenantMap.type";

const companySeedData = [
  {
    tenantSlug: "acme",
    name: "Acme HQ",
    subdomain: "acme",
    description: "Acme primary organization for support.",
    settings: { region: "us-east-1" },
  },
  {
    tenantSlug: "globex",
    name: "Globex HQ",
    subdomain: "globex",
    description: "Globex primary organization.",
    settings: { region: "eu-west-1" },
  },
];

export async function seedCompanies(
  tenantMap: TenantMap,
  client = db
): Promise<{ id: string; tenant_id: string; name: string }[]> {
  const values = companySeedData.map((company) => {
    const tenantId = tenantMap.get(company.tenantSlug);
    if (!tenantId) {
      throw new Error(
        `[seed] Missing tenant for slug ${company.tenantSlug} - did seedTenants run?`
      );
    }

    return {
      id: randomUUID(),
      tenantId,
      name: company.name,
      subdomain: company.subdomain,
      description: company.description,
      settings: company.settings,
    };
  });

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
