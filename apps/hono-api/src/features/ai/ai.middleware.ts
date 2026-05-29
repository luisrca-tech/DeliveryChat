import type { MiddlewareHandler } from "hono";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getTenantAuth } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS } from "../../lib/http.js";
import { getAiLimitsByPlan } from "../../lib/planLimits.js";
import { db } from "../../db/index.js";
import { tenantRateLimits } from "../../db/schema/tenantRateLimits.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";

export const QUOTA_EXCLUDED_ACTIONS = ["interview"] as const;

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function requireAiFeature(): MiddlewareHandler {
  return async (c, next) => {
    const auth = getTenantAuth(c);
    const plan = auth.organization.plan;
    const limits = getAiLimitsByPlan(plan);

    if (!limits.aiAssistantEnabled) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        "ai_feature_not_available",
        "AI assistant is not available on your current plan.",
      );
    }

    let monthlyCap = limits.aiMonthlyCap;

    const overrides = await db
      .select({ aiMonthlyCapOverride: tenantRateLimits.aiMonthlyCapOverride })
      .from(tenantRateLimits)
      .where(eq(tenantRateLimits.tenantId, auth.organization.id))
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
          eq(aiUsageLog.tenantId, auth.organization.id),
          gte(aiUsageLog.createdAt, monthStart.toISOString()),
          inArray(aiUsageLog.status, [...countableStatuses]),
          ...QUOTA_EXCLUDED_ACTIONS.map((action) =>
            ne(aiUsageLog.action, action),
          ),
        ),
      );

    const currentUsage = usageRows[0]?.count ?? 0;

    if (currentUsage >= monthlyCap) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        "ai_monthly_cap_exceeded",
        "You have reached your monthly AI usage limit.",
      );
    }

    await next();
  };
}

type RateLimitWindow = {
  windowMs: number;
  maxRequests: number;
};

const AI_RATE_LIMIT_WINDOWS: RateLimitWindow[] = [
  { windowMs: 60_000, maxRequests: 10 },
  { windowMs: 86_400_000, maxRequests: 250 },
];

const rateLimitStore = new Map<string, { count: number; resetAt: number }[]>();

export function _testGetRateLimitStore() {
  return rateLimitStore;
}

export function createAiRateLimitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const auth = getTenantAuth(c);
    const tenantId = auth.organization.id;
    const now = Date.now();

    if (!rateLimitStore.has(tenantId)) {
      rateLimitStore.set(
        tenantId,
        AI_RATE_LIMIT_WINDOWS.map((w) => ({
          count: 0,
          resetAt: now + w.windowMs,
        })),
      );
    }

    const windows = rateLimitStore.get(tenantId)!;
    let allExpired = true;

    for (let i = 0; i < windows.length; i++) {
      const win = windows[i]!;
      const cfg = AI_RATE_LIMIT_WINDOWS[i]!;

      if (now >= win.resetAt) {
        win.count = 0;
        win.resetAt = now + cfg.windowMs;
      } else {
        allExpired = false;
      }

      if (win.count >= cfg.maxRequests) {
        const retryAfter = Math.ceil((win.resetAt - now) / 1000);
        c.header("Retry-After", String(retryAfter));
        return jsonError(
          c,
          HTTP_STATUS.TOO_MANY_REQUESTS,
          "ai_rate_limit_exceeded",
          "Too many AI requests. Please try again later.",
        );
      }
    }

    if (allExpired) {
      rateLimitStore.delete(tenantId);
      rateLimitStore.set(
        tenantId,
        AI_RATE_LIMIT_WINDOWS.map((w) => ({
          count: 1,
          resetAt: now + w.windowMs,
        })),
      );
    } else {
      for (const window of windows) {
        window.count++;
      }
    }

    await next();
  };
}
