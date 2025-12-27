import type { TenantSeed } from "../types/tenantSeed.type";

export const tenantSeedData = [
  {
    slug: "acme",
    name: "Acme Inc",
    description: "Core tenant for the embeddable support product.",
    plan: "PREMIUM",
  },
  {
    slug: "globex",
    name: "Globex Corp",
    description: "Secondary tenant to validate multi-tenant constraints.",
    plan: "BASIC",
  },
] satisfies TenantSeed[];
