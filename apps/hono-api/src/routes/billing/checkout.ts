import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../../db/index.js";
import { member } from "../../db/schema/member.js";
import { user as userTable } from "../../db/schema/users.js";
import { env } from "../../env.js";
import { getTenantAuth, requireRole } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import { getUserAdminUrl } from "../../lib/auth.js";
import { stripe } from "../../lib/stripe.js";
import { sendEnterprisePlanRequestEmail } from "../../lib/email/index.js";
import { checkoutBodySchema } from "./schemas.js";

export const checkoutRoute = new Hono().post(
  "/checkout",
  zValidator("json", checkoutBodySchema),
  requireRole("super_admin"),
  async (c) => {
    try {
      const { plan, currency, enterpriseDetails } = c.req.valid("json");
      const auth = getTenantAuth(c);
      const { organization } = auth;

      const [dbUser] = await db
        .select({ email: userTable.email, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, auth.user.id))
        .limit(1);

      if (!dbUser) {
        return jsonError(
          c,
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_MESSAGES.UNAUTHORIZED,
        );
      }

      const memberCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(member)
        .where(eq(member.organizationId, organization.id));

      const memberCount = Number(memberCountResult[0]?.count ?? 0);

      if (plan === "enterprise") {
        await sendEnterprisePlanRequestEmail({
          organizationName: organization.name,
          adminEmail: dbUser.email,
          memberCount,
          enterpriseDetails: enterpriseDetails ?? null,
        });

        return c.json({
          status: "manual_review",
          message: "We have received your request!",
        });
      }

      const planUpper = plan.toUpperCase() as "BASIC" | "PREMIUM";
      const price =
        planUpper === "BASIC"
          ? env.STRIPE_BASIC_PRICE_KEY
          : env.STRIPE_PREMIUM_PRICE_KEY;

      const adminBaseUrl = await getUserAdminUrl(
        auth.user.id,
        c.req.raw.headers,
      );

      const isAlreadyTrialing = organization.planStatus === "trialing";

      const baseParams: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        currency,
        line_items: [{ price, quantity: 1 }],
        client_reference_id: organization.id,
        success_url: `${adminBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${adminBaseUrl}/settings/billing`,
        billing_address_collection: "required",
        metadata: { plan: planUpper },
        subscription_data: {
          ...(isAlreadyTrialing ? {} : { trial_period_days: 14 }),
          metadata: { plan: planUpper },
        },
        ...(organization.stripeCustomerId
          ? { customer: organization.stripeCustomerId }
          : { customer_email: dbUser.email }),
      };

      const shouldEnableAutomaticTax =
        env.STRIPE_AUTOMATIC_TAX_ENABLED === true;

      let session: Stripe.Response<Stripe.Checkout.Session>;
      try {
        session = await stripe.checkout.sessions.create(
          shouldEnableAutomaticTax
            ? { ...baseParams, automatic_tax: { enabled: true } }
            : baseParams,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const isUnsupportedTax =
          message.includes(
            "Stripe Tax is not supported for your account country",
          ) || message.includes("Stripe Tax is not supported");

        if (shouldEnableAutomaticTax && isUnsupportedTax) {
          session = await stripe.checkout.sessions.create(baseParams);
        } else {
          throw error;
        }
      }

      if (!session.url) {
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "Stripe did not return a checkout URL",
        );
      }

      return c.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  },
);
