import { tenantPlanEnum } from "../../schema/enums/tenantPlanEnum";

export type TenantSeed = {
  slug: string;
  name: string;
  description: string;
  settings: Record<string, unknown>;
  plan: (typeof tenantPlanEnum.enumValues)[number];
};