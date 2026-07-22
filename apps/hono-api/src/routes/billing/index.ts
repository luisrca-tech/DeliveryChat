import { Hono } from "hono";
import { requireTenantAuth } from "../../lib/middleware/auth.js";
import { createTenantRateLimitMiddleware } from "../../lib/middleware/rateLimit.js";
import { statusRoute } from "./status.js";
import { checkoutRoute } from "./checkout.js";
import { portalRoute } from "./portal.js";
import { aiAddonRoute } from "./aiAddon.js";

export const billingRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", createTenantRateLimitMiddleware())
  .route("/", statusRoute)
  .route("/", checkoutRoute)
  .route("/", portalRoute)
  .route("/", aiAddonRoute);
