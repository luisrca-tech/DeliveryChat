import { Hono } from "hono";
import type Stripe from "stripe";
import { db } from "../../db/index.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import {
  verifyStripeSignature,
  deduplicateEvent,
  rollbackProcessedEvent,
} from "./utils.js";
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "./subscription.js";
import { handleInvoicePaid, handleInvoicePaymentFailed } from "./invoice.js";
import { handleCheckoutSessionCompleted } from "./checkout.js";
import type { EmailTask } from "./types.js";

export const webhooksRoute = new Hono().post("/stripe", async (c) => {
  try {
    const signatureResult = await verifyStripeSignature(c);
    if (!signatureResult.ok) return signatureResult.response;
    const { event } = signatureResult;

    console.info(`[Webhook] Received event: ${event.type} (${event.id})`);

    const dedupeResult = await deduplicateEvent(c, event.id);
    if (!dedupeResult.ok) return dedupeResult.response;

    const emailTasks: EmailTask[] = [];

    try {
      await db.transaction(async (tx) => {
        const ctx = { tx, emailTasks };

        switch (event.type) {
          case "invoice.paid":
            await handleInvoicePaid(
              event.data.object as Stripe.Invoice,
              ctx,
            );
            break;

          case "invoice.payment_failed":
            await handleInvoicePaymentFailed(
              event.data.object as Stripe.Invoice,
              ctx,
            );
            break;

          case "customer.subscription.created":
            await handleSubscriptionCreated(
              event.data.object as Stripe.Subscription,
              ctx,
            );
            break;

          case "customer.subscription.updated":
            await handleSubscriptionUpdated(
              event.data.object as Stripe.Subscription,
              ctx,
            );
            break;

          case "customer.subscription.deleted":
            await handleSubscriptionDeleted(
              event.data.object as Stripe.Subscription,
              ctx,
            );
            break;

          case "checkout.session.completed":
            await handleCheckoutSessionCompleted(
              event.data.object as Stripe.Checkout.Session,
              ctx,
            );
            break;

          default:
            console.info(`[Webhook] Unhandled event type: ${event.type}`);
        }
      });
    } catch (error) {
      console.error("[Webhook] Billing webhook processing failed:", error);
      await rollbackProcessedEvent(event.id);
      throw error;
    }

    for (const task of emailTasks) {
      try {
        await task();
      } catch (emailError) {
        console.error(
          "[Webhook] Failed to send notification email:",
          emailError,
        );
      }
    }

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
