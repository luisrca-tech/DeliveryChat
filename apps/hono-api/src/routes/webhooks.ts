import { Hono } from "hono";
import type Stripe from "stripe";
import { db } from "../db/index.js";
import { organization } from "../db/schema/organization.js";
import { processedEvents } from "../db/schema/processedEvents.js";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import { stripe } from "../lib/stripe.js";

export const webhooksRoute = new Hono().post("/stripe", async (c) => {
  try {
    const signature = c.req.header("stripe-signature");
    if (!signature) {
      console.error("[Webhook] Missing stripe-signature header");
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Missing stripe-signature header",
      );
    }

    const body = await c.req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        env.SIGNING_STRIPE_SECRET_KEY,
      );
    } catch (error) {
      console.error("[Webhook] Signature verification failed:", error);
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Invalid signature",
      );
    }

    console.info(`[Webhook] Received event: ${event.type} (${event.id})`);

    try {
      await db.insert(processedEvents).values({ id: event.id });
    } catch {
      console.info(`[Webhook] Event ${event.id} already processed, skipping`);
      return c.json(
        { received: true, message: "Event already processed" },
        200,
      );
    }

    await db.transaction(async (tx) => {
      switch (event.type) {
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          if (!customerId) {
            console.error("[Webhook] invoice.paid: Missing customer ID");
            return;
          }

          const [org] = await tx
            .select()
            .from(organization)
            .where(eq(organization.stripeCustomerId, customerId))
            .limit(1);

          if (!org) {
            console.error(
              `[Webhook] invoice.paid: Organization not found for customer ${customerId}`,
            );
            return;
          }

          await tx
            .update(organization)
            .set({
              planStatus: "active",
              updatedAt: new Date().toISOString(),
            })
            .where(eq(organization.id, org.id));

          console.info(
            `[Webhook] invoice.paid: Updated org ${org.id} to active`,
          );
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          if (!customerId) {
            console.error(
              "[Webhook] invoice.payment_failed: Missing customer ID",
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
              `[Webhook] invoice.payment_failed: Organization not found for customer ${customerId}`,
            );
            return;
          }

          await tx
            .update(organization)
            .set({
              planStatus: "past_due",
              updatedAt: new Date().toISOString(),
            })
            .where(eq(organization.id, org.id));

          console.info(
            `[Webhook] invoice.payment_failed: Updated org ${org.id} to past_due`,
          );
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
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

          await tx
            .update(organization)
            .set({
              planStatus: "canceled",
              stripeSubscriptionId: null,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(organization.id, org.id));

          console.info(
            `[Webhook] customer.subscription.deleted: Updated org ${org.id} to canceled`,
          );
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
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

          await tx
            .update(organization)
            .set({
              planStatus,
              stripeSubscriptionId: subscription.id,
              cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
              trialEndsAt,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(organization.id, org.id));

          console.info(
            `[Webhook] customer.subscription.updated: Synced org ${org.id} status to ${planStatus}`,
          );
          break;
        }

        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
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

          await tx
            .update(organization)
            .set({
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId || null,
              planStatus: "trialing",
              ...(selectedPlan === "BASIC" ||
              selectedPlan === "PREMIUM" ||
              selectedPlan === "ENTERPRISE"
                ? { plan: selectedPlan }
                : {}),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(organization.id, org.id));

          console.info(
            `[Webhook] checkout.session.completed: Updated org ${org.id} with Stripe IDs, set to trialing`,
          );
          break;
        }

        default:
          console.info(`[Webhook] Unhandled event type: ${event.type}`);
      }
    });

    return c.json({ received: true }, 200);
  } catch (error) {
    console.error("[Webhook] Error processing webhook:", error);
    return jsonError(
      c,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
});
