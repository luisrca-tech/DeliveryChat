import { Resend } from "resend";
import { env } from "../env.js";
import { render, toPlainText } from "@react-email/render";
import {
  EmailVerifiedWelcomeEmail,
  EnterprisePlanRequestEmail,
  InvoiceReceiptEmail,
  NewSignInAlertEmail,
  PaymentFailedEmail,
  PlanUpgradedEmail,
  PasswordChangedEmail,
  ResetPasswordEmail,
  SubscriptionCanceledEmail,
  TrialEndingSoonEmail,
  TrialStartedEmail,
  VerificationOtpEmail,
} from "@repo/emails";
import * as React from "react";

const resend = new Resend(env.RESEND_API_KEY);

const getFromEmail = () =>
  env.EMAIL_FROM || "Delivery Chat <noreply@deliverychat.online>";

export interface SendVerificationOTPEmailParams {
  email: string;
  otp: string;
}

export interface SendResetPasswordEmailParams {
  email: string;
  url: string;
  userName?: string;
}

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

async function renderEmail(template: React.ReactElement): Promise<{
  html: string;
  text: string;
}> {
  const html = await render(template);
  return { html, text: toPlainText(html) };
}

async function sendEmail(params: {
  to: string | string[];
  subject: string;
  template: React.ReactElement;
}): Promise<void> {
  if (process.env.VERCEL_ENV === "preview") {
    console.info("[Email] Suppressed in preview environment");
    return;
  }

  const { html, text } = await renderEmail(params.template);
  const result = await resend.emails.send({
    from: getFromEmail(),
    to: params.to,
    subject: params.subject,
    html,
    text,
  });

  if (result.error) {
    console.error("[Email] Resend API error:", result.error);
    throw new Error(result.error.message || "Failed to send email");
  }
}

export async function sendVerificationOTPEmail(
  params: SendVerificationOTPEmailParams,
): Promise<void> {
  const { email, otp } = params;

  try {
    await sendEmail({
      to: email,
      subject: "Verify your email address",
      template: React.createElement(VerificationOtpEmail, { otp }),
    });
  } catch (error) {
    console.error("[Email] Failed to send OTP email:", error);
    throw error;
  }
}

export async function sendResetPasswordEmail(
  params: SendResetPasswordEmailParams,
): Promise<void> {
  const { email, url, userName } = params;

  try {
    await sendEmail({
      to: email,
      subject: "Reset your password",
      template: React.createElement(ResetPasswordEmail, { url, userName }),
    });
  } catch (error) {
    console.error("[Email] Failed to send reset password email:", error);
    throw error;
  }
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

export async function sendTrialStartedEmail(params: {
  email: string;
  plan: "BASIC" | "PREMIUM" | "ENTERPRISE";
  trialEndsAt: string;
  organizationName?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "Your trial has started",
    template: React.createElement(TrialStartedEmail, {
      plan: params.plan,
      trialEndsAt: params.trialEndsAt,
      organizationName: params.organizationName,
    }),
  });
}

export async function sendTrialEndingSoonEmail(params: {
  email: string;
  plan: "BASIC" | "PREMIUM" | "ENTERPRISE";
  trialEndsAt: string;
  daysLeft: number;
  organizationName?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: `Your trial ends in ${params.daysLeft} days`,
    template: React.createElement(TrialEndingSoonEmail, {
      plan: params.plan,
      trialEndsAt: params.trialEndsAt,
      daysLeft: params.daysLeft,
      organizationName: params.organizationName,
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

export async function sendEmailVerifiedWelcomeEmail(params: {
  email: string;
  userName?: string;
  organizationName?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "You’re verified",
    template: React.createElement(EmailVerifiedWelcomeEmail, {
      userName: params.userName,
      organizationName: params.organizationName,
    }),
  });
}

export async function sendPasswordChangedEmail(params: {
  email: string;
  occurredAt: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "Password changed",
    template: React.createElement(PasswordChangedEmail, {
      occurredAt: params.occurredAt,
    }),
  });
}

export async function sendNewSignInAlertEmail(params: {
  email: string;
  occurredAt: string;
  ip?: string | null;
  userAgent?: string | null;
  location?: string | null;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "New sign-in detected",
    template: React.createElement(NewSignInAlertEmail, {
      occurredAt: params.occurredAt,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      location: params.location ?? null,
    }),
  });
}
