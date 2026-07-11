import { Hono } from "hono";
import { env } from "../../env.js";
import { getTenantAuth, requireRole } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import { stripe } from "../../lib/stripe.js";

const ADDON_ELIGIBLE_PLANS = ["PREMIUM", "ENTERPRISE"] as const;
const ADDON_ACTIVE_STATUSES = ["active", "trialing"] as const;

/**
 * AI add-on lifecycle. The add-on is modeled as a SECOND subscription item on
 * the existing subscription — never a second subscription. These routes only
 * mutate Stripe; the `aiAddonActive` / `aiAddonSubscriptionItemId` entitlement
 * columns are derived exclusively from webhooks, so the response is a
 * `pending` acknowledgement (the flag flips once Stripe emits the webhook).
 */
export const aiAddonRoute = new Hono()
  .post("/ai-addon", requireRole("super_admin"), async (c) => {
    try {
      const { organization } = getTenantAuth(c);

      if (!organization.stripeSubscriptionId) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          "no_active_subscription",
          "An active subscription is required before adding the AI add-on.",
        );
      }

      if (
        !ADDON_ACTIVE_STATUSES.includes(
          organization.planStatus as (typeof ADDON_ACTIVE_STATUSES)[number],
        )
      ) {
        return jsonError(
          c,
          HTTP_STATUS.PAYMENT_REQUIRED,
          "subscription_not_active",
          "Your subscription must be active or trialing to add the AI add-on.",
        );
      }

      if (
        !ADDON_ELIGIBLE_PLANS.includes(
          organization.plan as (typeof ADDON_ELIGIBLE_PLANS)[number],
        )
      ) {
        return jsonError(
          c,
          HTTP_STATUS.FORBIDDEN,
          "plan_not_eligible",
          "The AI add-on is only available on the PREMIUM and ENTERPRISE plans.",
        );
      }

      if (organization.aiAddonActive) {
        return jsonError(
          c,
          HTTP_STATUS.CONFLICT,
          "ai_addon_already_active",
          "The AI add-on is already active for this organization.",
        );
      }

      await stripe.subscriptionItems.create({
        subscription: organization.stripeSubscriptionId,
        price: env.STRIPE_AI_ADDON_PRICE_KEY,
        quantity: 1,
      });

      return c.json({
        status: "pending",
        message:
          "AI add-on purchase started. It will activate once payment is confirmed.",
      });
    } catch (error) {
      console.error("Error adding AI add-on:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  })
  .delete("/ai-addon", requireRole("super_admin"), async (c) => {
    try {
      const { organization } = getTenantAuth(c);

      if (!organization.aiAddonSubscriptionItemId) {
        return jsonError(
          c,
          HTTP_STATUS.CONFLICT,
          "ai_addon_not_active",
          "There is no active AI add-on to cancel.",
        );
      }

      await stripe.subscriptionItems.del(
        organization.aiAddonSubscriptionItemId,
        { proration_behavior: "create_prorations" },
      );

      return c.json({
        status: "pending",
        message:
          "AI add-on cancellation started. It will be removed once confirmed.",
      });
    } catch (error) {
      console.error("Error removing AI add-on:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  });
