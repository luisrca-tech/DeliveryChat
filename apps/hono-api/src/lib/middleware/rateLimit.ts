import type { MiddlewareHandler } from "hono";
import { rateLimiter, MemoryStore } from "hono-rate-limiter";
import { getTenantAuth } from "./auth.js";
import { getRateLimitsForTenant } from "../../features/rate-limiting/rateLimitConfig.service.js";
import { HTTP_STATUS } from "../http.js";
import type { RateLimitConfig } from "../../lib/planLimits.js";
import { recordRateLimitExceeded } from "../../features/rate-limiting/rateLimitAlert.service.js";

const WINDOWS = [
  {
    name: "second" as const,
    windowMs: 1000,
    getLimit: (r: RateLimitConfig) => r.perSecond,
  },
  {
    name: "minute" as const,
    windowMs: 60_000,
    getLimit: (r: RateLimitConfig) => r.perMinute,
  },
  {
    name: "hour" as const,
    windowMs: 3_600_000,
    getLimit: (r: RateLimitConfig) => r.perHour,
  },
] as const;

const STORES = WINDOWS.map(() => new MemoryStore());

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

function create429Response(
  retryAfter: number,
  currentLimit: number,
): Record<string, unknown> {
  return {
    error: "Rate limit exceeded",
    retryAfter,
    currentLimit,
  };
}

export function createTenantRateLimitMiddleware(): MiddlewareHandler {
  const middlewares = WINDOWS.map((w, i) =>
    rateLimiter({
      windowMs: w.windowMs,
      limit: async (c) => {
        const auth = getTenantAuth(c);
        if (!auth) return 999_999;
        const limits = await getCachedTenantLimits(c, auth);
        return w.getLimit(limits);
      },
      keyGenerator: async (c) => {
        const auth = getTenantAuth(c);
        const orgId = auth?.organization.id ?? "unknown";
        return `tenant:${orgId}:${w.name}`;
      },
      store: STORES[i],
      standardHeaders: "draft-6",
      message: async (c) => {
        const auth = getTenantAuth(c);
        const limits = await getCachedTenantLimits(c, auth);
        const limit = w.getLimit(limits);
        const retryAfter = Math.ceil(w.windowMs / 1000);
        return create429Response(retryAfter, limit);
      },
      handler: async (c) => {
        const auth = getTenantAuth(c);
        let limit = 100;
        if (auth) {
          const limits = await getCachedTenantLimits(c, auth);
          limit = w.getLimit(limits);
          const info = (c as { get: (k: string) => unknown }).get(
            "rateLimit",
          ) as { used: number; resetTime?: Date } | undefined;
          recordRateLimitExceeded(
            auth.organization.id,
            auth.organization,
            w.name,
            info?.used ?? limit + 1,
            limit,
          ).catch((err: Error) =>
            console.error("[RateLimit] Failed to record event:", err),
          );
        }
        c.status(HTTP_STATUS.TOO_MANY_REQUESTS);
        const retryAfter = Math.ceil(w.windowMs / 1000);
        const body = create429Response(retryAfter, limit);
        c.header("Retry-After", String(retryAfter));
        return c.json(body);
      },
    }),
  );

  const handler = async (
    c: Parameters<MiddlewareHandler>[0],
    next: Parameters<MiddlewareHandler>[1],
  ) => {
    const runChain = async (i: number): Promise<Response | void> => {
      if (i >= middlewares.length) return next();
      const mw = middlewares[i];
      if (!mw) return next();
      const nextFn = () => runChain(i + 1);
      return mw(c, nextFn as Parameters<typeof mw>[1]);
    };
    const result = await runChain(0);
    if (result instanceof Response) return result;
  };
  return handler as MiddlewareHandler;
}
