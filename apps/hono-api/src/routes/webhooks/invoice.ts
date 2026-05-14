import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organization } from "../../db/schema/organization.js";
import { stripe } from "../../lib/stripe.js";
import {
  sendInvoiceReceiptEmail,
  sendPaymentFailedEmail,
  sendPlanUpgradedEmail,
} from "../../lib/email/index.js";
import { formatDate } from "../../utils/date.js";
import { extractPlanFromMetadata, formatMoney } from "./utils.js";
import type { HandlerContext } from "./types.js";

export async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  { tx, emailTasks }: HandlerContext,
): Promise<void> {
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

  const billingEmail = org.billingEmail;
  if (billingEmail) {
    const amountPaid = formatMoney(
      typeof invoice.amount_paid === "number" ? invoice.amount_paid : null,
    );
    const interval =
      invoice.lines?.data?.[0]?.price?.recurring?.interval ?? null;

    emailTasks.push(async () => {
      await sendInvoiceReceiptEmail({
        email: billingEmail,
        amountPaid,
        currency: invoice.currency ?? null,
        interval,
        nextBillingDate: null,
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdfUrl: invoice.invoice_pdf ?? null,
        organizationName: org.name,
      });
    });

    const wasInactive = org.planStatus !== "active";
    if (wasInactive && (org.plan === "BASIC" || org.plan === "PREMIUM")) {
      const plan = org.plan;
      emailTasks.push(async () => {
        await sendPlanUpgradedEmail({
          email: billingEmail,
          plan,
          organizationName: org.name,
          nextBillingDate: null,
        });
      });
    }
  }

  let invoicePlan: ReturnType<typeof extractPlanFromMetadata> = null;
  const subscriptionId = invoice.subscription as string | null;
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      invoicePlan = extractPlanFromMetadata(
        sub.metadata as Record<string, string>,
      );
    } catch (err) {
      console.error(
        `[Webhook] invoice.paid: Failed to retrieve subscription ${subscriptionId}:`,
        err,
      );
    }
  }

  await tx
    .update(organization)
    .set({
      planStatus: "active",
      ...(invoicePlan ? { plan: invoicePlan } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organization.id, org.id));

  console.info(`[Webhook] invoice.paid: Updated org ${org.id} to active`);
}

export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  { tx, emailTasks }: HandlerContext,
): Promise<void> {
  const customerId = invoice.customer as string;

  if (!customerId) {
    console.error("[Webhook] invoice.payment_failed: Missing customer ID");
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

  const billingEmail = org.billingEmail;
  if (billingEmail) {
    const amountDue = formatMoney(
      typeof invoice.amount_due === "number" ? invoice.amount_due : null,
    );
    const nextRetryAt =
      typeof invoice.next_payment_attempt === "number"
        ? formatDate(new Date(invoice.next_payment_attempt * 1000))
        : null;

    emailTasks.push(async () => {
      await sendPaymentFailedEmail({
        email: billingEmail,
        amount: amountDue,
        currency: invoice.currency ?? null,
        nextRetryAt,
        organizationName: org.name,
      });
    });
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
}
