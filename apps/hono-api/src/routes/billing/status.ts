import { Hono } from "hono";
import { getTenantAuth } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";

export const statusRoute = new Hono().get("/status", async (c) => {
  try {
    const { organization, membership } = getTenantAuth(c);
    const planStatus = organization.planStatus;
    const trialEndsAt = organization.trialEndsAt;

    const trialExpired =
      planStatus === "trialing" &&
      !!trialEndsAt &&
      Date.now() > new Date(trialEndsAt).getTime();

    return c.json({
      plan: organization.plan,
      planStatus,
      cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
      trialEndsAt,
      role: membership.role,
      aiAddonActive: organization.aiAddonActive,
      isReady:
        (planStatus === "active" || planStatus === "trialing") && !trialExpired,
    });
  } catch (error) {
    console.error("Error fetching billing status:", error);
    return jsonError(
      c,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
});
