import type { MiddlewareHandler } from "hono";
import { createRateLimiter } from "./rateLimitFactory.js";

type VisitorRateLimitConfig = {
  perSecond: number;
  perMinute: number;
  perHour: number;
};

export function createVisitorRateLimitMiddleware(
  config: VisitorRateLimitConfig,
): MiddlewareHandler {
  return createRateLimiter({
    cause: "per_visitor",
    limits: config,
    keyGenerator: (c) => {
      const appId = c.req.header("X-App-Id")?.trim();
      const visitorId = c.req.header("X-Visitor-Id")?.trim();
      if (!appId || !visitorId) return null;
      return `visitor:${appId}:${visitorId}`;
    },
  });
}
