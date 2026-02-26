import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { tenantRateLimits } from "../../db/schema/tenantRateLimits.js";
import {
  getRateLimitsByPlan,
  type RateLimitConfig,
} from "../../lib/plan-limits.js";

export async function getRateLimitsForTenant(
  orgId: string,
  plan: string,
): Promise<RateLimitConfig> {
  const [override] = await db
    .select()
    .from(tenantRateLimits)
    .where(eq(tenantRateLimits.tenantId, orgId))
    .limit(1);

  if (!override) {
    return getRateLimitsByPlan(plan);
  }

  const defaults = getRateLimitsByPlan(plan);
  return {
    perSecond: override.requestsPerSecond ?? defaults.perSecond,
    perMinute: override.requestsPerMinute ?? defaults.perMinute,
    perHour: override.requestsPerHour ?? defaults.perHour,
  };
}
