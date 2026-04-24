import type { Context, MiddlewareHandler } from "hono";
import { rateLimiter, MemoryStore } from "hono-rate-limiter";
import { HTTP_STATUS } from "../http.js";
import type { RateLimitWindow } from "../../features/rate-limiting/types.js";

type RateLimitConfig = {
  perSecond: number;
  perMinute: number;
  perHour: number;
};

type RateLimiterOptions = {
  cause: string;
  limits: RateLimitConfig | ((c: Context) => Promise<RateLimitConfig>);
  keyGenerator: (c: Context) => string | null;
  onExceeded?: (c: Context, window: RateLimitWindow, limit: number) => void;
};

const WINDOWS = [
  { name: "second" as const, windowMs: 1_000, key: "perSecond" as const },
  { name: "minute" as const, windowMs: 60_000, key: "perMinute" as const },
  { name: "hour" as const, windowMs: 3_600_000, key: "perHour" as const },
] as const;

async function resolveLimits(
  opts: RateLimiterOptions,
  c: Context,
): Promise<RateLimitConfig> {
  return typeof opts.limits === "function" ? opts.limits(c) : opts.limits;
}

export function createRateLimiter(opts: RateLimiterOptions): MiddlewareHandler {
  const stores = WINDOWS.map(() => new MemoryStore());

  const middlewares = WINDOWS.map((w, i) =>
    rateLimiter({
      windowMs: w.windowMs,
      limit: async (c) => {
        const limits = await resolveLimits(opts, c);
        return limits[w.key];
      },
      keyGenerator: (c) => opts.keyGenerator(c) ?? `bypass:${Math.random()}`,
      store: stores[i],
      standardHeaders: "draft-6",
      skip: (c) => opts.keyGenerator(c) === null,
      handler: async (c) => {
        const limits = await resolveLimits(opts, c);
        opts.onExceeded?.(c, w.name, limits[w.key]);

        const key = opts.keyGenerator(c);
        let retryAfter = Math.ceil(w.windowMs / 1_000);
        if (key) {
          const info = await stores[i]!.get?.(key);
          if (info?.resetTime) {
            const remaining = Math.ceil(
              (info.resetTime.getTime() - Date.now()) / 1_000,
            );
            if (remaining > 0) retryAfter = remaining;
          }
        }

        c.status(HTTP_STATUS.TOO_MANY_REQUESTS);
        c.header("Retry-After", String(retryAfter));
        return c.json({
          error: "Rate limit exceeded",
          cause: opts.cause,
          retryAfter,
          window: w.name,
        });
      },
    }),
  );

  return chainMiddlewares(middlewares);
}

function chainMiddlewares(
  middlewares: ReturnType<typeof rateLimiter>[],
): MiddlewareHandler {
  const handler = async (
    c: Parameters<MiddlewareHandler>[0],
    next: Parameters<MiddlewareHandler>[1],
  ) => {
    const runChain = async (i: number): Promise<unknown> => {
      if (i >= middlewares.length) return next();
      const mw = middlewares[i];
      if (!mw) return next();
      return mw(
        c,
        (() => runChain(i + 1)) as Parameters<typeof mw>[1],
      );
    };
    const result = await runChain(0);
    if (result instanceof Response) return result;
  };
  return handler as MiddlewareHandler;
}
