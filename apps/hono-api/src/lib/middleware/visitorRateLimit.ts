import type { MiddlewareHandler } from "hono";
import { rateLimiter, MemoryStore } from "hono-rate-limiter";
import { HTTP_STATUS } from "../http.js";

type VisitorRateLimitConfig = {
  perSecond: number;
  perMinute: number;
  perHour: number;
};

const WINDOWS = [
  { name: "second" as const, windowMs: 1_000, key: "perSecond" as const },
  { name: "minute" as const, windowMs: 60_000, key: "perMinute" as const },
  { name: "hour" as const, windowMs: 3_600_000, key: "perHour" as const },
] as const;

function visitorKey(c: { req: { header: (n: string) => string | undefined } }) {
  const appId = c.req.header("X-App-Id")?.trim();
  const visitorId = c.req.header("X-Visitor-Id")?.trim();
  if (!appId || !visitorId) return null;
  return `visitor:${appId}:${visitorId}`;
}

export function createVisitorRateLimitMiddleware(
  config: VisitorRateLimitConfig,
): MiddlewareHandler {
  const stores = WINDOWS.map(() => new MemoryStore());

  const middlewares = WINDOWS.map((w, i) =>
    rateLimiter({
      windowMs: w.windowMs,
      limit: config[w.key],
      keyGenerator: (c) => visitorKey(c) ?? `bypass:${Math.random()}`,
      store: stores[i],
      standardHeaders: "draft-6",
      skip: (c) => visitorKey(c) === null,
      handler: (c) => {
        const retryAfter = Math.ceil(w.windowMs / 1_000);
        c.status(HTTP_STATUS.TOO_MANY_REQUESTS);
        c.header("Retry-After", String(retryAfter));
        return c.json({
          error: "Rate limit exceeded",
          cause: "per_visitor",
          retryAfter,
          window: w.name,
        });
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
      return mw(c, (() => runChain(i + 1)) as Parameters<typeof mw>[1]);
    };
    const result = await runChain(0);
    if (result instanceof Response) return result;
  };

  return handler as MiddlewareHandler;
}
