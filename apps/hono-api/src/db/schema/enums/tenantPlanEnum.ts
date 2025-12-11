import { pgEnum } from "drizzle-orm/pg-core";

export const tenantPlanEnum = pgEnum("tenant_plan", [
  "BASIC",
  "PREMIUM",
  "ENTERPRISE",
]);
