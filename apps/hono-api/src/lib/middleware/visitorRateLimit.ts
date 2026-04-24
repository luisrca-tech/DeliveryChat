import type { MiddlewareHandler } from "hono";
import { HTTP_STATUS } from "../http.js";
import type { RateLimitWindow } from "../../features/rate-limiting/types.js";

type VisitorRateLimitConfig = {
  perSecond: number;
  perMinute: number;
  perHour: number;
};

export type RateLimitCheckResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; window: RateLimitWindow };

export type VisitorRateLimiter = ReturnType<typeof createVisitorWsRateLimiter>;

type WindowEntry = { count: number; resetAt: number };

const WINDOWS: readonly {
  name: RateLimitWindow;
  windowMs: number;
  key: keyof VisitorRateLimitConfig;
}[] = [
  { name: "second", windowMs: 1_000, key: "perSecond" },
  { name: "minute", windowMs: 60_000, key: "perMinute" },
  { name: "hour", windowMs: 3_600_000, key: "perHour" },
];

const CLEANUP_INTERVAL_MS = 60_000;

export function createVisitorWsRateLimiter(config: VisitorRateLimitConfig) {
  const stores: Map<string, WindowEntry>[] = WINDOWS.map(() => new Map());

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const store of stores) {
      for (const [k, entry] of store) {
        if (now >= entry.resetAt) store.delete(k);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }

  return {
    check(key: string): RateLimitCheckResult {
      const now = Date.now();

      for (let i = 0; i < WINDOWS.length; i++) {
        const w = WINDOWS[i]!;
        const store = stores[i]!;
        const limit = config[w.key];

        const entry = store.get(key);
        if (!entry || now >= entry.resetAt) {
          store.set(key, { count: 1, resetAt: now + w.windowMs });
          continue;
        }

        entry.count++;
        if (entry.count > limit) {
          const retryAfter = Math.max(
            1,
            Math.ceil((entry.resetAt - now) / 1_000),
          );
          return { allowed: false, retryAfter, window: w.name };
        }
      }

      return { allowed: true };
    },
  };
}

export function createVisitorRateLimitMiddleware(
  limiter: VisitorRateLimiter,
): MiddlewareHandler {
  return async (c, next) => {
    const appId = c.req.header("X-App-Id")?.trim();
    const visitorId = c.req.header("X-Visitor-Id")?.trim();

    let key: string;
    if (appId && visitorId) {
      key = `visitor:${appId}:${visitorId}`;
    } else {
      const ip =
        c.req.header("CF-Connecting-IP") ??
        c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
        "unknown";
      key = `visitor-ip:${ip}`;
    }

    const result = limiter.check(key);
    if (!result.allowed) {
      c.status(HTTP_STATUS.TOO_MANY_REQUESTS);
      c.header("Retry-After", String(result.retryAfter));
      return c.json({
        error: "Rate limit exceeded",
        cause: "per_visitor",
        retryAfter: result.retryAfter,
        window: result.window,
      });
    }

    return next();
  };
}
