import * as React from "react";
import {
  EmailVerifiedWelcomeEmail,
  NewSignInAlertEmail,
  PasswordChangedEmail,
  ResetPasswordEmail,
  VerificationOtpEmail,
} from "@repo/emails";
import { sendEmail } from "./client.js";

export interface SendVerificationOTPEmailParams {
  email: string;
  otp: string;
}

export interface SendResetPasswordEmailParams {
  email: string;
  url: string;
  userName?: string;
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

export async function sendEmailVerifiedWelcomeEmail(params: {
  email: string;
  userName?: string;
  organizationName?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "You're verified",
    template: React.createElement(EmailVerifiedWelcomeEmail, {
      userName: params.userName,
      organizationName: params.organizationName,
    }),
  });
}

export async function sendPasswordChangedEmail(params: {
  email: string;
  occurredAt: string;
  timeZone?: string;
}): Promise<void> {
  await sendEmail({
    to: params.email,
    subject: "Password changed",
    template: React.createElement(PasswordChangedEmail, {
      occurredAt: params.occurredAt,
      timeZone: params.timeZone,
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
