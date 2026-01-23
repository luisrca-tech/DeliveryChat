import { Hono } from "hono";
import { usersRoute } from "../routes/users.js";
import { applicationsRoute } from "../routes/applications.js";
import { registerRoute } from "../routes/register.js";
import { verifyEmailRoute } from "../routes/verify-email.js";
import { resendOtpRoute } from "../routes/resend-otp.js";
import { webhooksRoute } from "../routes/webhooks.js";
import { billingRoute } from "../routes/billing.js";

/**
 * Shared Hono instance for API routes
 * Routes are composed using .route() to ensure proper TypeScript inference for RPC
 * Following Hono RPC pattern for larger applications: https://hono.dev/docs/guides/rpc
 */
const app = new Hono()
  .route("/", registerRoute)
  .route("/", verifyEmailRoute)
  .route("/", resendOtpRoute)
  .route("/", usersRoute)
  .route("/", applicationsRoute)
  .route("/", billingRoute)
  .route("/", webhooksRoute);

export const api = app;
export type APIType = typeof app;
