import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { tenantRateLimits } from "../../db/schema/tenantRateLimits.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { getAiLimitsByPlan } from "../../lib/planLimits.js";

export const QUOTA_EXCLUDED_ACTIONS = [
  "interview",
  "interview_summary",
  "interview_forced_completion",
] as const;

type QuotaResult =
  | { allowed: true }
  | { allowed: false; reason: "ai_feature_not_available" | "ai_monthly_cap_exceeded" };

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkAiQuota(
  tenantId: string,
  plan: string,
): Promise<QuotaResult> {
  const limits = getAiLimitsByPlan(plan);

  if (!limits.aiAssistantEnabled) {
    return { allowed: false, reason: "ai_feature_not_available" };
  }

  let monthlyCap = limits.aiMonthlyCap;

  const overrides = await db
    .select({ aiMonthlyCapOverride: tenantRateLimits.aiMonthlyCapOverride })
    .from(tenantRateLimits)
    .where(eq(tenantRateLimits.tenantId, tenantId))
    .limit(1);

  if (overrides[0]?.aiMonthlyCapOverride != null) {
    monthlyCap = overrides[0].aiMonthlyCapOverride;
  }

  const monthStart = getMonthStart();
  const countableStatuses = ["success", "empty", "content_filtered"] as const;

  const usageRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.tenantId, tenantId),
        gte(aiUsageLog.createdAt, monthStart.toISOString()),
        inArray(aiUsageLog.status, [...countableStatuses]),
        ...QUOTA_EXCLUDED_ACTIONS.map((action) =>
          ne(aiUsageLog.action, action),
        ),
      ),
    );

  const currentUsage = usageRows[0]?.count ?? 0;

  if (currentUsage >= monthlyCap) {
    return { allowed: false, reason: "ai_monthly_cap_exceeded" };
  }

  return { allowed: true };
}
