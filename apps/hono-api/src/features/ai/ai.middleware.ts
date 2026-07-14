import type { MiddlewareHandler } from "hono";
import { getTenantAuth } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS } from "../../lib/http.js";
import { checkAiQuota, QUOTA_EXCLUDED_ACTIONS } from "./ai.quota.js";
import { canRunInterview, isAddonEntitled } from "./entitlement.js";

export { QUOTA_EXCLUDED_ACTIONS };

/**
 * Gates AI features that require the paid add-on entitlement. Delegates the
 * eligibility (plan ∈ {PREMIUM, ENTERPRISE}) AND entitlement (`aiAddonActive`,
 * derived from Stripe webhooks) rule to the shared `isAddonEntitled` seam.
 * Composes after `requireTenantAuth`.
 */
export function requireAiAddon(): MiddlewareHandler {
  return async (c, next) => {
    const { organization } = getTenantAuth(c);

    if (!isAddonEntitled(organization)) {
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

type AiFeatureKind = "reply" | "interview";

/**
 * Gates the two AI capabilities, which are NOT the same gate:
 *
 *   "interview" (authoring) — every plan may onboard; FREE only inside its trial
 *     window. Deliberately does not touch the quota: interview actions are
 *     cap-excluded, so a tenant sitting at its monthly limit can still finish
 *     onboarding.
 *
 *   "reply" (serving) — requires a plan that grants the assistant AND monthly
 *     cap headroom.
 */
export function requireAiFeature(
  feature: AiFeatureKind = "reply",
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getTenantAuth(c);

    if (feature === "interview") {
      if (!canRunInterview(auth.organization)) {
        return jsonError(
          c,
          HTTP_STATUS.FORBIDDEN,
          "ai_interview_trial_expired",
          "Your free trial has ended. Choose a plan to continue setting up your AI assistant.",
        );
      }

      await next();
      return;
    }

    const result = await checkAiQuota(
      auth.organization.id,
      auth.organization.plan,
    );

    if (!result.allowed) {
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
