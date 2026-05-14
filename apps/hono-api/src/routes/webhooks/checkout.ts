import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organization } from "../../db/schema/organization.js";
import type { HandlerContext } from "./types.js";

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  { tx }: HandlerContext,
): Promise<void> {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const clientReferenceId = session.client_reference_id;
  const selectedPlan = session.metadata?.plan ?? null;

  if (!customerId) {
    console.error(
      "[Webhook] checkout.session.completed: Missing customer ID",
    );
    return;
  }

  let org;
  if (clientReferenceId) {
    const [foundOrg] = await tx
      .select()
      .from(organization)
      .where(eq(organization.id, clientReferenceId))
      .limit(1);
    org = foundOrg;
  }

  if (!org && customerId) {
    const [foundOrg] = await tx
      .select()
      .from(organization)
      .where(eq(organization.stripeCustomerId, customerId))
      .limit(1);
    org = foundOrg;
  }

  if (!org) {
    console.error(
      `[Webhook] checkout.session.completed: Organization not found for customer ${customerId}`,
    );
    return;
  }

  const checkoutPlanStatus =
    org.planStatus === "trialing" ? "active" : "trialing";

  await tx
    .update(organization)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId || null,
      planStatus: checkoutPlanStatus,
      ...(selectedPlan === "BASIC" ||
      selectedPlan === "PREMIUM" ||
      selectedPlan === "ENTERPRISE"
        ? { plan: selectedPlan }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organization.id, org.id));

  console.info(
    `[Webhook] checkout.session.completed: Updated org ${org.id} with Stripe IDs, set to ${checkoutPlanStatus}`,
  );
}
