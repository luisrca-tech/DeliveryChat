import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organization } from "../../db/schema/organization.js";
import { stripe } from "../../lib/stripe.js";
import {
  sendSubscriptionCanceledEmail,
  sendTrialStartedEmail,
} from "../../lib/email/index.js";
import { formatDate } from "../../utils/date.js";
import { extractPlanFromMetadata } from "./utils.js";
import type { HandlerContext } from "./types.js";

export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  { tx, emailTasks }: HandlerContext,
): Promise<void> {
  const customerId = subscription.customer as string;

  if (!customerId) {
    console.error(
      "[Webhook] customer.subscription.created: Missing customer ID",
    );
    return;
  }

  const [org] = await tx
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org) {
    console.error(
      `[Webhook] customer.subscription.created: Organization not found for customer ${customerId}`,
    );
    return;
  }

  const createdPlanStatus =
    subscription.status === "trialing" ? "trialing" : "active";

  const createdTrialEndsAt =
    createdPlanStatus === "trialing" && subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

  const createdPlan = extractPlanFromMetadata(
    subscription.metadata as Record<string, string>,
  );

  await tx
    .update(organization)
    .set({
      stripeSubscriptionId: subscription.id,
      planStatus: createdPlanStatus,
      ...(createdTrialEndsAt ? { trialEndsAt: createdTrialEndsAt } : {}),
      ...(createdPlan ? { plan: createdPlan } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organization.id, org.id));

  console.info(
    `[Webhook] customer.subscription.created: Synced org ${org.id} with subscription ${subscription.id}`,
  );
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  { tx, emailTasks }: HandlerContext,
): Promise<void> {
  const customerId = subscription.customer as string;

  if (!customerId) {
    console.error(
      "[Webhook] customer.subscription.updated: Missing customer ID",
    );
    return;
  }

  const [org] = await tx
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org) {
    console.error(
      `[Webhook] customer.subscription.updated: Organization not found for customer ${customerId}`,
    );
    return;
  }

  const planStatus =
    subscription.status === "active"
      ? "active"
      : subscription.status === "trialing"
        ? "trialing"
        : subscription.status === "past_due"
          ? "past_due"
          : subscription.status === "canceled"
            ? "canceled"
            : subscription.status === "unpaid"
              ? "unpaid"
              : subscription.status === "incomplete"
                ? "incomplete"
                : subscription.status === "paused"
                  ? "paused"
                  : null;

  const trialEndsAt =
    planStatus === "trialing" && subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

  const billingEmail = org.billingEmail;
  if (billingEmail) {
    const isTrialingWithDate = planStatus === "trialing" && !!trialEndsAt;
    const trialWasNotSet = !org.trialEndsAt;
    if (
      isTrialingWithDate &&
      trialWasNotSet &&
      (org.plan === "BASIC" ||
        org.plan === "PREMIUM" ||
        org.plan === "ENTERPRISE")
    ) {
      const plan = org.plan;
      emailTasks.push(async () => {
        await sendTrialStartedEmail({
          email: billingEmail,
          plan,
          trialEndsAt: formatDate(new Date(trialEndsAt!)),
          organizationName: org.name,
        });
      });
    }

    const cancelFlippedOn =
      !!subscription.cancel_at_period_end && !org.cancelAtPeriodEnd;
    if (cancelFlippedOn) {
      const effectiveAt =
        typeof subscription.current_period_end === "number"
          ? formatDate(new Date(subscription.current_period_end * 1000))
          : formatDate(new Date());
      emailTasks.push(async () => {
        await sendSubscriptionCanceledEmail({
          email: billingEmail,
          cancelAtPeriodEnd: true,
          effectiveAt,
          organizationName: org.name,
        });
      });
    }
  }

  const metadataPlan = extractPlanFromMetadata(
    subscription.metadata as Record<string, string>,
  );

  await tx
    .update(organization)
    .set({
      planStatus,
      stripeSubscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      trialEndsAt,
      ...(metadataPlan ? { plan: metadataPlan } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organization.id, org.id));

  console.info(
    `[Webhook] customer.subscription.updated: Synced org ${org.id} status to ${planStatus}`,
  );
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  { tx, emailTasks }: HandlerContext,
): Promise<void> {
  const customerId = subscription.customer as string;

  if (!customerId) {
    console.error(
      "[Webhook] customer.subscription.deleted: Missing customer ID",
    );
    return;
  }

  const [org] = await tx
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);

  if (!org) {
    console.error(
      `[Webhook] customer.subscription.deleted: Organization not found for customer ${customerId}`,
    );
    return;
  }

  const billingEmail = org.billingEmail;
  if (billingEmail) {
    emailTasks.push(async () => {
      await sendSubscriptionCanceledEmail({
        email: billingEmail,
        cancelAtPeriodEnd: false,
        effectiveAt: formatDate(new Date()),
        organizationName: org.name,
      });
    });
  }

  await tx
    .update(organization)
    .set({
      plan: "FREE",
      planStatus: "canceled",
      stripeSubscriptionId: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organization.id, org.id));

  console.info(
    `[Webhook] customer.subscription.deleted: Updated org ${org.id} to canceled`,
  );
}
