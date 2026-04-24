import type { MiddlewareHandler } from "hono";
import { getTenantAuth } from "./auth.js";
import { createRateLimiter } from "./rateLimitFactory.js";
import { getRateLimitsForTenant } from "../../features/rate-limiting/rateLimitConfig.service.js";
import { recordRateLimitExceeded } from "../../features/rate-limiting/rateLimitAlert.service.js";
import type { RateLimitConfig } from "../../lib/planLimits.js";

async function getCachedTenantLimits(
  c: Parameters<MiddlewareHandler>[0],
  auth: NonNullable<ReturnType<typeof getTenantAuth>>,
): Promise<RateLimitConfig> {
  const ctx = c as {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
  const cached = ctx.get("tenantRateLimits") as RateLimitConfig | undefined;
  if (cached) return cached;

  const limits = await getRateLimitsForTenant(
    auth.organization.id,
    auth.organization.plan,
  );
  ctx.set("tenantRateLimits", limits);
  return limits;
}

export function createTenantRateLimitMiddleware(): MiddlewareHandler {
  return createRateLimiter({
    cause: "per_tenant",
    limits: async (c) => {
      const auth = getTenantAuth(c);
      if (!auth) return { perSecond: 999_999, perMinute: 999_999, perHour: 999_999 };
      return getCachedTenantLimits(c, auth);
    },
    keyGenerator: (c) => {
      const auth = getTenantAuth(c);
      const orgId = auth?.organization.id;
      if (!orgId) return null;
      return `tenant:${orgId}`;
    },
    onExceeded: (c, window, limit) => {
      const auth = getTenantAuth(c);
      if (!auth) return;
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
}
