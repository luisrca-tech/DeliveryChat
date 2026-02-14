import * as React from "react";
import { TrialEndingSoonEmail, TrialStartedEmail } from "@repo/emails";
import { sendEmail } from "./client.js";

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
