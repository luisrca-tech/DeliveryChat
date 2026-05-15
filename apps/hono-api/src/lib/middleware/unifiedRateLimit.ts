import type { MiddlewareHandler } from "hono";
import { getUnifiedAuth, type UnifiedAuthContext } from "./unifiedAuth.js";
import { createRateLimiter } from "./rateLimitFactory.js";
import { getRateLimitsForTenant } from "../../features/rate-limiting/rateLimitConfig.service.js";
import { recordRateLimitExceeded } from "../../features/rate-limiting/rateLimitAlert.service.js";
import { VISITOR_RATE_LIMITS, type RateLimitConfig } from "../planLimits.js";

export function createUnifiedRateLimitMiddleware(): MiddlewareHandler {
  const tenantLimiter = createRateLimiter({
    cause: "per_tenant",
    limits: async (c) => {
      const auth = getUnifiedAuth(c);
      if (auth.type !== "member")
        return { perSecond: 999_999, perMinute: 999_999, perHour: 999_999 };

      const cached = (c as { get: (k: string) => unknown }).get(
        "tenantRateLimits",
      ) as RateLimitConfig | undefined;
      if (cached) return cached;

      const limits = await getRateLimitsForTenant(
        auth.organization.id,
        auth.organization.plan,
      );
      (c as { set: (k: string, v: unknown) => void }).set(
        "tenantRateLimits",
        limits,
      );
      return limits;
    },
    keyGenerator: (c) => {
      const auth = getUnifiedAuth(c);
      if (auth.type !== "member") return null;
      return `tenant:${auth.organization.id}`;
    },
    onExceeded: (c, window, limit) => {
      const auth = getUnifiedAuth(c);
      if (auth.type !== "member") return;
      const info = (c as { get: (k: string) => unknown }).get("rateLimit") as
        | { used: number }
        | undefined;
      recordRateLimitExceeded(
        auth.organization.id,
        auth.organization,
        window,
        info?.used ?? limit + 1,
        limit,
      ).catch((err: Error) =>
        console.error("[RateLimit] Failed to record event:", err),
      );
    },
  });

  const visitorLimiter = createRateLimiter({
    cause: "per_visitor",
    limits: VISITOR_RATE_LIMITS,
    keyGenerator: (c) => {
      const auth = getUnifiedAuth(c);
      if (auth.type !== "visitor") return null;
      return `visitor:${auth.application.id}:${auth.visitorId}`;
    },
  });

  return async (c, next) => {
    const auth = (c as { get: (k: string) => unknown }).get("unifiedAuth") as
      | UnifiedAuthContext
      | undefined;

    if (!auth) {
      return next();
    }

    if (auth.type === "member") {
      return tenantLimiter(c, next);
    }

    return visitorLimiter(c, next);
  };
}
