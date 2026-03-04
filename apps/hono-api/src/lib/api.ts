import { Hono } from "hono";
import { usersRoute } from "../routes/users.js";
import { applicationsRoute } from "../routes/applications.js";
import { apiKeysRoute } from "../routes/apiKeys.js";
import { registerRoute } from "../routes/register.js";
import { verifyEmailRoute } from "../routes/verifyEmail.js";
import { resendOtpRoute } from "../routes/resendOtp.js";
import { webhooksRoute } from "../routes/webhooks.js";
import { billingRoute } from "../routes/billing.js";
import { tenantsRoute } from "../routes/tenants.js";
import { widgetRoute } from "../routes/widget.js";
import { rateLimitsRoute } from "../routes/rateLimits.js";

/**
 * Shared Hono instance for API routes
 * Routes are composed using .route() to ensure proper TypeScript inference for RPC
 * Following Hono RPC pattern for larger applications: https://hono.dev/docs/guides/rpc
 */
const app = new Hono()
  .route("/", registerRoute)
  .route("/", verifyEmailRoute)
  .route("/", resendOtpRoute)
  .route("/", tenantsRoute)
  .route("/users", usersRoute)
  .route("/applications", applicationsRoute)
  .route("/api-keys", apiKeysRoute)
  .route("/billing", billingRoute)
  .route("/rate-limits", rateLimitsRoute)
  .route("/webhooks", webhooksRoute)
  .route("/widget", widgetRoute);

export const api = app;
export type APIType = typeof app;
