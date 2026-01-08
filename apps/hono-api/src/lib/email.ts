/**
 * Email sending utilities using Resend
 *
 * Better Auth requires you to implement email sending manually.
 * This implementation uses Resend for sending OTP verification emails.
 */

import { Resend } from "resend";
import { env } from "../env.js";

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

export async function sendVerificationOTPEmail(
  params: SendVerificationOTPEmailParams,
): Promise<void> {
  const { email, otp } = params;

  if (process.env.VERCEL_ENV === "preview") {
    console.info("[Email] Suppressed in preview environment");
    return;
  }

  try {
    const result = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Verify your email address",
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a; margin-bottom: 24px;">Verify your email address</h1>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
            Thank you for signing up! Please use the verification code below to complete your registration:
          </p>
          <div style="background-color: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin: 32px 0;">
            <p style="font-size: 32px; font-weight: 600; letter-spacing: 8px; color: #1a1a1a; margin: 0; font-family: monospace;">
              ${otp}
            </p>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 20px; margin-top: 24px;">
            This code will expire in 5 minutes. If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `Verify your email address\n\nThank you for signing up! Please use the verification code below to complete your registration:\n\n${otp}\n\nThis code will expire in 5 minutes. If you didn't request this code, you can safely ignore this email.`,
    });

    if (result.error) {
      console.error("[Email] Resend API error:", result.error);
      throw new Error(result.error.message || "Failed to send email");
    }
  } catch (error) {
    console.error("[Email] Failed to send OTP email:", error);
    throw error;
  }
}

export async function sendResetPasswordEmail(
  params: SendResetPasswordEmailParams,
): Promise<void> {
  const { email, url, userName } = params;

  if (process.env.VERCEL_ENV === "preview") {
    console.info("[Email] Suppressed in preview environment");
    return;
  }

  try {
    const result = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Reset your password",
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a; margin-bottom: 24px;">Reset your password</h1>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
            ${userName ? `Hi ${userName},` : "Hi,"}
          </p>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${url}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 20px; margin-top: 24px;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #666; font-size: 14px; line-height: 20px; word-break: break-all;">
            <a href="${url}" style="color: #1a1a1a; text-decoration: underline;">${url}</a>
          </p>
          <p style="color: #666; font-size: 14px; line-height: 20px; margin-top: 24px;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `Reset your password\n\n${userName ? `Hi ${userName},` : "Hi,"}\n\nWe received a request to reset your password. Click the link below to create a new password:\n\n${url}\n\nThis link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.`,
    });

    if (result.error) {
      console.error("[Email] Resend API error:", result.error);
      throw new Error(result.error.message || "Failed to send email");
    }
  } catch (error) {
    console.error("[Email] Failed to send reset password email:", error);
    throw error;
  }
}
