import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organization as organizationTable } from "../../db/schema/organization.js";
import { getTenantAuth } from "../../lib/middleware/auth.js";
import { stripe } from "../../lib/stripe.js";
import { resolvePlan } from "../../lib/stripePlan.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";

/**
 * Repairs orgs whose stored plan drifted from Stripe.
 *
 * Webhooks are the normal sync path, but they can be missed (endpoint down,
 * signature rotation, a plan changed in the Stripe Dashboard before this endpoint
 * existed). Billing status is the one page where a stale plan is both visible and
 * actionable, so it reconciles on read: fetch the live subscription, resolve its
 * plan from the price, and persist when it disagrees.
 *
 * Stripe being unreachable must not break the page — on failure we log and serve
 * the stored plan.
 */
async function reconcilePlan(org: {
  id: string;
  plan: string;
  stripeSubscriptionId: string | null;
}): Promise<string> {
  if (!org.stripeSubscriptionId) return org.plan;

  try {
    const subscription = await stripe.subscriptions.retrieve(
      org.stripeSubscriptionId,
    );
    const livePlan = resolvePlan(subscription);

    if (!livePlan || livePlan === org.plan) return org.plan;

    await db
      .update(organizationTable)
      .set({ plan: livePlan, updatedAt: new Date().toISOString() })
      .where(eq(organizationTable.id, org.id));

    console.info(
      `[Billing] Reconciled org ${org.id} plan ${org.plan} → ${livePlan} from subscription ${org.stripeSubscriptionId}`,
    );

    return livePlan;
  } catch (error) {
    console.error(
      `[Billing] Failed to reconcile plan for org ${org.id} from Stripe:`,
      error,
    );
    return org.plan;
  }
}

export const statusRoute = new Hono().get("/status", async (c) => {
  try {
    const { organization, membership } = getTenantAuth(c);
    const planStatus = organization.planStatus;
    const trialEndsAt = organization.trialEndsAt;

    const trialExpired =
      planStatus === "trialing" &&
      !!trialEndsAt &&
      Date.now() > new Date(trialEndsAt).getTime();

    const plan = await reconcilePlan(organization);

    return c.json({
      plan,
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
