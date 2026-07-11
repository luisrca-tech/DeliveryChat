import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { tenantRateLimits } from "../../db/schema/tenantRateLimits.js";
import { getTenantAuth } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS } from "../../lib/http.js";
import { checkAiQuota, QUOTA_EXCLUDED_ACTIONS } from "./ai.quota.js";

export { QUOTA_EXCLUDED_ACTIONS };

const ADDON_ELIGIBLE_PLANS = ["PREMIUM", "ENTERPRISE"] as const;

/**
 * Gates AI features that require the paid add-on entitlement. Requires both
 * eligibility (plan ∈ {PREMIUM, ENTERPRISE}) AND entitlement (`aiAddonActive`,
 * which is derived from Stripe webhooks). Composes after `requireTenantAuth`.
 */
export function requireAiAddon(): MiddlewareHandler {
  return async (c, next) => {
    const { organization } = getTenantAuth(c);

    const eligible = ADDON_ELIGIBLE_PLANS.includes(
      organization.plan as (typeof ADDON_ELIGIBLE_PLANS)[number],
    );

    if (!eligible || !organization.aiAddonActive) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        "ai_addon_not_active",
        "The AI add-on is not active for your organization.",
      );
    }

    await next();
  };
}

/**
 * Gates the AI database-connection capability. On top of the add-on
 * entitlement, this requires ENTERPRISE custom eligibility: plan === ENTERPRISE
 * AND the org has a custom rate-limit override (`tenantRateLimits.isCustom`).
 */
export function requireAiDbFeature(): MiddlewareHandler {
  return async (c, next) => {
    const { organization } = getTenantAuth(c);

    if (organization.plan !== "ENTERPRISE" || !organization.aiAddonActive) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        "ai_db_feature_not_available",
        "The AI database connection is only available on ENTERPRISE custom plans with the AI add-on active.",
      );
    }

    const [override] = await db
      .select({ isCustom: tenantRateLimits.isCustom })
      .from(tenantRateLimits)
      .where(eq(tenantRateLimits.tenantId, organization.id))
      .limit(1);

    if (!override?.isCustom) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        "ai_db_feature_not_available",
        "The AI database connection is only available on ENTERPRISE custom plans with the AI add-on active.",
      );
    }

    await next();
  };
}

type AiFeatureKind = "reply" | "interview";

export function requireAiFeature(
  feature: AiFeatureKind = "reply",
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getTenantAuth(c);
    const result = await checkAiQuota(auth.organization.id, auth.organization.plan);

    if (!result.allowed) {
      // Interview calls are excluded from the monthly cap; only the
      // plan-availability gate applies.
      if (feature === "interview" && result.reason === "ai_monthly_cap_exceeded") {
        await next();
        return;
      }

      const message =
        result.reason === "ai_feature_not_available"
          ? "AI assistant is not available on your current plan."
          : "You have reached your monthly AI usage limit.";

      return jsonError(c, HTTP_STATUS.FORBIDDEN, result.reason, message);
    }

    await next();
  };
}

import { InMemoryRateLimitStore } from "./ai.rateLimit.js";
import type { RateLimitStore } from "./ai.rateLimit.js";

const AI_RATE_LIMIT_WINDOWS = [
  { windowMs: 60_000, maxRequests: 10 },
  { windowMs: 86_400_000, maxRequests: 250 },
];

const defaultStore = new InMemoryRateLimitStore(AI_RATE_LIMIT_WINDOWS);

export function createAiRateLimitMiddleware(
  store: RateLimitStore = defaultStore,
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getTenantAuth(c);
    const tenantId = auth.organization.id;

    const result = store.check(tenantId);

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return jsonError(
        c,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        "ai_rate_limit_exceeded",
        "Too many AI requests. Please try again later.",
      );
    }

    store.increment(tenantId);
    await next();
  };
}
