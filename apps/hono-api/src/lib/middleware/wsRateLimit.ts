import type { MiddlewareHandler } from "hono";
import { createRateLimiter } from "./rateLimitFactory.js";

export function createWsUpgradeRateLimitMiddleware(): MiddlewareHandler {
  return createRateLimiter({
    cause: "ws_upgrade",
    limits: {
      perSecond: 5,
      perMinute: 30,
      perHour: 200,
    },
    keyGenerator: (c) => {
      const ip =
        c.req.header("CF-Connecting-IP") ??
        c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
        "unknown";
      return `ws-upgrade:${ip}`;
    },
  });
}
