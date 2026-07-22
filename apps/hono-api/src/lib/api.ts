import { Hono } from "hono";
import { usersRoute } from "../routes/users.js";
import { applicationsRoute } from "../routes/applications.js";
import { apiKeysRoute } from "../routes/apiKeys.js";
import { registerRoute } from "../routes/register.js";
import { verifyEmailRoute } from "../routes/verifyEmail.js";
import { resendOtpRoute } from "../routes/resendOtp.js";
import { webhooksRoute } from "../routes/webhooks/index.js";
import { billingRoute } from "../routes/billing/index.js";
import { tenantsRoute } from "../routes/tenants.js";
import { widgetRoute } from "../routes/widget.js";
import { rateLimitsRoute } from "../routes/rateLimits.js";
import { conversationsRoute } from "../routes/conversations/index.js";
import { invitationsRoute } from "../routes/invitations.js";
import { aiRoute } from "../routes/ai.js";
import { aiInterviewRoute } from "../routes/applications/ai-interview/index.js";
import { dataToolsRoute } from "../routes/applications/data-tools/index.js";
import { publicRoute } from "../routes/public/index.js";

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
  .route("/applications", aiInterviewRoute)
  .route("/applications", dataToolsRoute)
  .route("/api-keys", apiKeysRoute)
  .route("/billing", billingRoute)
  .route("/rate-limits", rateLimitsRoute)
  .route("/webhooks", webhooksRoute)
  .route("/widget", widgetRoute)
  .route("/conversations", conversationsRoute)
  .route("/invitations", invitationsRoute)
  .route("/ai", aiRoute)
  .route("/public", publicRoute);

export const api = app;
export type APIType = typeof app;
