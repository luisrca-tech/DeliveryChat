import type { MiddlewareHandler } from "hono";
import { getTenantAuth } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS } from "../../lib/http.js";
import { checkAiQuota, QUOTA_EXCLUDED_ACTIONS } from "./ai.quota.js";

export { QUOTA_EXCLUDED_ACTIONS };

export function requireAiFeature(): MiddlewareHandler {
  return async (c, next) => {
    const auth = getTenantAuth(c);
    const result = await checkAiQuota(auth.organization.id, auth.organization.plan);

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
