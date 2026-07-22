import { Hono } from "hono";
import { createVisitorRateLimitMiddleware } from "../../lib/middleware/visitorRateLimit.js";
import { sharedVisitorRateLimiter } from "../../lib/middleware/visitorRateLimitInstance.js";
import { plansRoute } from "./plans.js";
import { docsRoute } from "./docs.js";

/**
 * Public, unauthenticated marketing/docs endpoints — no tenant resolution,
 * no auth. Dogfooded as AI DataTools so the tenant AI can answer pricing and
 * documentation questions from live data. See public-api.md and
 * features/ai-data/docs/data-tool-management.md ("Dogfooding").
 *
 * All routes are IP-rate-limited via the shared visitor limiter (there is no
 * visitor identity here, so it falls through to the IP-based key).
 */
export const publicRoute = new Hono()
  .use("*", createVisitorRateLimitMiddleware(sharedVisitorRateLimiter))
  .route("/", plansRoute)
  .route("/", docsRoute);
