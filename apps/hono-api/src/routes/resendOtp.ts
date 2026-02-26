import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth } from "../lib/auth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import { APIError } from "better-auth/api";
import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { eq } from "drizzle-orm";
import { resendOtpSchema } from "./schemas/resendOtp.js";
import { mapToHttpStatus } from "./utils/httpStatus.js";
import { checkResendOtpRateLimit } from "../features/rate-limiting/resendOtpRateLimit.js";

export const resendOtpRoute = new Hono().post(
  "/resend-otp",
  zValidator("json", resendOtpSchema),
  async (c) => {
    try {
      const { email } = c.req.valid("json");

      const rateLimit = checkResendOtpRateLimit(email);
      if (!rateLimit.allowed) {
        c.header("Retry-After", String(rateLimit.retryAfterSeconds ?? 60));
        return jsonError(
          c,
          HTTP_STATUS.TOO_MANY_REQUESTS,
          ERROR_MESSAGES.TOO_MANY_REQUESTS,
          "Too many resend attempts. Please try again later.",
        );
      }

      const users = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      const existingUser = users[0];

      if (!existingUser) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "User not found",
        );
      }

      if (existingUser.status !== "PENDING_VERIFICATION") {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.BAD_REQUEST,
          "User is not in pending verification status",
        );
      }

      if (!existingUser.pendingExpiresAt) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.BAD_REQUEST,
          "Verification period has expired",
        );
      }

      const expiresAt = new Date(existingUser.pendingExpiresAt);
      const now = new Date();

      if (expiresAt <= now) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.BAD_REQUEST,
          "Verification period has expired",
        );
      }

      try {
        await auth.api.sendVerificationOTP({
          body: {
            email,
            type: "email-verification",
          },
          headers: c.req.raw.headers,
        });
      } catch (error) {
        console.error("[Resend OTP] Error sending OTP:", error);
        if (error instanceof APIError) {
          return jsonError(
            c,
            mapToHttpStatus(error.status),
            "Failed to resend verification code",
            error.message,
          );
        }
        throw error;
      }

      return c.json({
        success: true,
        message: "Verification code resent",
      });
    } catch (error) {
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  },
);
