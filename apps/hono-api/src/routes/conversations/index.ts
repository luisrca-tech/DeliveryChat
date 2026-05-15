import { Hono } from "hono";
import { createUnifiedRateLimitMiddleware } from "../../lib/middleware/unifiedRateLimit.js";
import { queriesRoute } from "./queries.js";
import { messagingRoute } from "./messaging.js";
import { lifecycleRoute } from "./lifecycle.js";
import { readReceiptsRoute } from "./readReceipts.js";

export const conversationsRoute = new Hono()
  .use("*", createUnifiedRateLimitMiddleware())
  .route("/", queriesRoute)
  .route("/", messagingRoute)
  .route("/", lifecycleRoute)
  .route("/", readReceiptsRoute);
