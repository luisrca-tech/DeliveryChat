import { render, toPlainText } from "@react-email/render";
import * as React from "react";
import { describe, expect, it } from "vitest";
import {
  EmailVerifiedWelcomeEmail,
  EnterprisePlanRequestEmail,
  InvoiceReceiptEmail,
  NewSignInAlertEmail,
  PasswordChangedEmail,
  PaymentFailedEmail,
  PlanUpgradedEmail,
  ResetPasswordEmail,
  SubscriptionCanceledEmail,
  TrialEndingSoonEmail,
  TrialStartedEmail,
  VerificationOtpEmail,
} from "../index";

describe("email templates", () => {
  it("renders VerificationOtpEmail with OTP", async () => {
    const html = await render(
      React.createElement(VerificationOtpEmail, { otp: "123456" }),
    );
    expect(html).toContain("123456");
    expect(toPlainText(html)).toContain("123456");
  });

  it("renders ResetPasswordEmail with URL", async () => {
    const url = "https://example.com/reset?token=abc";
    const html = await render(
      React.createElement(ResetPasswordEmail, { url, userName: "Alex" }),
    );
    expect(html).toContain(url);
    expect(toPlainText(html)).toContain(url);
  });

  it("renders EnterprisePlanRequestEmail with org/admin", async () => {
    const html = await render(
      React.createElement(EnterprisePlanRequestEmail, {
        organizationName: "Acme",
        adminEmail: "admin@acme.test",
        memberCount: 10,
        enterpriseDetails: null,
      }),
    );
    expect(html).toContain("Acme");
    expect(html).toContain("admin@acme.test");
  });

  it("renders billing templates with key fields", async () => {
    const upgraded = await render(
      React.createElement(PlanUpgradedEmail, { plan: "BASIC" }),
    );
    expect(toPlainText(upgraded)).toContain("BASIC");

    const trialStarted = await render(
      React.createElement(TrialStartedEmail, {
        plan: "PREMIUM",
        trialEndsAt: "2026-02-21",
      }),
    );
    expect(toPlainText(trialStarted)).toContain("2026-02-21");

    const trialEnding = await render(
      React.createElement(TrialEndingSoonEmail, {
        plan: "PREMIUM",
        trialEndsAt: "2026-02-21",
        daysLeft: 3,
      }),
    );
    expect(toPlainText(trialEnding)).toContain("3");

    const paymentFailed = await render(
      React.createElement(PaymentFailedEmail, {
        amount: "99.00",
        currency: "usd",
      }),
    );
    expect(toPlainText(paymentFailed)).toContain("99.00");

    const canceled = await render(
      React.createElement(SubscriptionCanceledEmail, {
        effectiveAt: "2026-03-07",
        cancelAtPeriodEnd: true,
      }),
    );
    expect(toPlainText(canceled)).toContain("2026-03-07");

    const receipt = await render(
      React.createElement(InvoiceReceiptEmail, {
        amountPaid: "99.00",
        currency: "usd",
        invoiceUrl: "https://stripe.test/invoice",
      }),
    );
    expect(toPlainText(receipt)).toContain("99.00");
  });

  it("renders security templates", async () => {
    const welcome = await render(
      React.createElement(EmailVerifiedWelcomeEmail, {
        userName: "Alex",
        organizationName: "Acme",
      }),
    );
    expect(toPlainText(welcome)).toContain("verified");

    const pwd = await render(
      React.createElement(PasswordChangedEmail, { occurredAt: "2026-02-07" }),
    );
    expect(toPlainText(pwd)).toContain("2026-02-07");

    const signIn = await render(
      React.createElement(NewSignInAlertEmail, { occurredAt: "2026-02-07" }),
    );
    expect(toPlainText(signIn).toLowerCase()).toContain("new sign-in");
  });
});

