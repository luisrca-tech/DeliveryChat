import * as React from "react";
import {
  EnterprisePlanRequestEmail,
  InvoiceReceiptEmail,
  PaymentFailedEmail,
  PlanUpgradedEmail,
  SubscriptionCanceledEmail,
} from "@repo/emails";
import { sendEmail } from "./client.js";
import { env } from "../../env.js";

export interface SendEnterprisePlanRequestEmailParams {
  organizationName: string;
  adminEmail: string;
  memberCount: number;
  enterpriseDetails?: {
    fullName: string;
    email: string;
    phone?: string;
    teamSize?: number;
    notes?: string;
  } | null;
}

export async function sendEnterprisePlanRequestEmail(
  params: SendEnterprisePlanRequestEmailParams,
): Promise<void> {
  const { organizationName, adminEmail, memberCount, enterpriseDetails } =
    params;
  try {
    await sendEmail({
      to: env.RESEND_EMAIL_TO,
      subject: "Enterprise plan request",
      template: React.createElement(EnterprisePlanRequestEmail, {
        organizationName,
        adminEmail,
        memberCount,
        enterpriseDetails,
      }),
    });
  } catch (error) {
    console.error("[Email] Failed to send enterprise request email:", error);
    throw error;
  }
}

export async function sendPlanUpgradedEmail(params: {
  email: string;
  plan: "BASIC" | "PREMIUM";
  organizationName?: string;
  nextBillingDate?: string | null;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: `Welcome to ${params.plan}`,
    template: React.createElement(PlanUpgradedEmail, {
      plan: params.plan,
      organizationName: params.organizationName,
      nextBillingDate: params.nextBillingDate ?? null,
    }),
  });
}

export async function sendPaymentFailedEmail(params: {
  email: string;
  amount?: string | null;
  currency?: string | null;
  nextRetryAt?: string | null;
  organizationName?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "Payment failed",
    template: React.createElement(PaymentFailedEmail, {
      amount: params.amount ?? null,
      currency: params.currency ?? null,
      nextRetryAt: params.nextRetryAt ?? null,
      organizationName: params.organizationName,
    }),
  });
}

export async function sendSubscriptionCanceledEmail(params: {
  email: string;
  effectiveAt: string;
  cancelAtPeriodEnd: boolean;
  organizationName?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: params.cancelAtPeriodEnd
      ? "Subscription cancellation scheduled"
      : "Subscription canceled",
    template: React.createElement(SubscriptionCanceledEmail, {
      effectiveAt: params.effectiveAt,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      organizationName: params.organizationName,
    }),
  });
}

export async function sendInvoiceReceiptEmail(params: {
  email: string;
  amountPaid?: string | null;
  currency?: string | null;
  interval?: string | null;
  nextBillingDate?: string | null;
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  organizationName?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "Payment receipt",
    template: React.createElement(InvoiceReceiptEmail, {
      amountPaid: params.amountPaid ?? null,
      currency: params.currency ?? null,
      interval: params.interval ?? null,
      nextBillingDate: params.nextBillingDate ?? null,
      invoiceUrl: params.invoiceUrl ?? null,
      invoicePdfUrl: params.invoicePdfUrl ?? null,
      organizationName: params.organizationName,
    }),
  });
}
