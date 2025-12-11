import type { TenantSeed } from "../types/tenantSeed.type";

export const tenantSeedData = [
  {
    slug: "acme",
    name: "Acme Inc",
    description: "Core tenant for the embeddable support product.",
    plan: "PREMIUM",
    settings: { locale: "en-US" },
  },
  {
    slug: "globex",
    name: "Globex Corp",
    description: "Secondary tenant to validate multi-tenant constraints.",
    plan: "BASIC",
    settings: { locale: "en-GB" },
  },
] satisfies TenantSeed[];
