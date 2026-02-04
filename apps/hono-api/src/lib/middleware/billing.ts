import type { MiddlewareHandler } from "hono";
import { getTenantAuth } from "./auth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";

export function checkBillingStatus(): MiddlewareHandler {
  return async (c, next) => {
    const auth = getTenantAuth(c);
    if (!auth) {
      return await next();
    }

    const { organization, membership } = auth;
    const planStatus = organization.planStatus;
    const trialEndsAt = organization.trialEndsAt;
    const method = c.req.method;
    const path = c.req.path;
    const isReadOnly = method === "GET";

    const isTrialExpired =
      planStatus === "trialing" &&
      !!trialEndsAt &&
      Date.now() > new Date(trialEndsAt).getTime();

    if (planStatus === null || planStatus === "active") {
      return await next();
    }

    if (planStatus === "trialing" && !isTrialExpired) {
      return await next();
    }

    if (planStatus === "trialing" && isTrialExpired) {
      if (
        membership.role === "super_admin" &&
        (path.includes("/billing/checkout") ||
          path.includes("/billing/portal-session"))
      ) {
        return await next();
      }

      return jsonError(
        c,
        HTTP_STATUS.PAYMENT_REQUIRED,
        ERROR_MESSAGES.PAYMENT_REQUIRED,
        "Your trial has ended. Please choose a plan to continue.",
      );
    }

    if (planStatus === "past_due") {
      if (isReadOnly || method === "DELETE") {
        return await next();
      }

      const message =
        membership.role === "super_admin"
          ? "Please update your payment method to continue."
          : "Your organization's payment failed. Please contact your Admin.";

      return jsonError(
        c,
        HTTP_STATUS.PAYMENT_REQUIRED,
        ERROR_MESSAGES.PAYMENT_REQUIRED,
        message,
      );
    }

    if (planStatus === "unpaid" || planStatus === "canceled") {
      if (
        membership.role === "super_admin" &&
        path.includes("/billing/portal-session")
      ) {
        return await next();
      }

      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        ERROR_MESSAGES.FORBIDDEN,
        "Your subscription has been canceled or is unpaid. Please upgrade your plan.",
      );
    }

    if (planStatus === "incomplete" || planStatus === "paused") {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        ERROR_MESSAGES.FORBIDDEN,
        "Your subscription is incomplete or paused. Please contact support.",
      );
    }

    return await next();
  };
}
