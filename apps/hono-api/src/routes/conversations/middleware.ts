import type { MiddlewareHandler } from "hono";
import { createUnifiedRateLimitMiddleware } from "../../lib/middleware/unifiedRateLimit.js";

export const conversationMiddleware: MiddlewareHandler[] = [
  createUnifiedRateLimitMiddleware(),
];
