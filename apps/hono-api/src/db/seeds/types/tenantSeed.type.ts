import { tenantPlanEnum } from "../../schema/enums/tenantPlanEnum";

export type TenantSeed = {
  slug: string;
  name: string;
  description: string;
  plan: (typeof tenantPlanEnum.enumValues)[number];
};
