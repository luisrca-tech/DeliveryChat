import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth } from "../lib/auth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import { APIError } from "better-auth/api";
import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { organization } from "../db/schema/organization.js";
import { member } from "../db/schema/member.js";
import { eq } from "drizzle-orm";
import { verifyEmailSchema } from "./schemas/verify-email.js";
import { mapToHttpStatus } from "./utils/httpStatus.js";

export const verifyEmailRoute = new Hono().post(
  "/verify-email",
  zValidator("json", verifyEmailSchema),
  async (c) => {
    try {
      const { email, otp } = c.req.valid("json");

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
          "Email already verified or invalid status",
        );
      }

      try {
        const baseUrl = c.req.url.split("/api")[0] || "http://localhost:8000";
        const verifyUrl = `${baseUrl}/api/auth/email-otp/verify-email`;

        const origin =
          c.req.header("origin") || c.req.header("referer") || baseUrl;

        const verifyRequest = new Request(verifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            cookie: c.req.header("cookie") || "",
          },
          body: JSON.stringify({ email, otp }),
        });

        const verifyResponse = await auth.handler(verifyRequest);

        if (!verifyResponse.ok) {
          const errorData = await verifyResponse.json().catch(() => ({}));
          return jsonError(
            c,
            mapToHttpStatus(verifyResponse.status),
            "Verification failed",
            errorData.message || "Invalid OTP code",
          );
        }
      } catch (error) {
        if (error instanceof APIError) {
          return jsonError(
            c,
            mapToHttpStatus(error.status),
            "Verification failed",
            error.message,
          );
        }
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }

      const members = await db
        .select()
        .from(member)
        .where(eq(member.userId, existingUser.id))
        .limit(1);
      const userMember = members[0];

      if (!userMember) {
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "Organization membership not found",
        );
      }

      const orgs = await db
        .select()
        .from(organization)
        .where(eq(organization.id, userMember.organizationId))
        .limit(1);
      const org = orgs[0];

      if (!org) {
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "Organization not found",
        );
      }

      const now = new Date().toISOString();

      await db
        .update(user)
        .set({
          status: "ACTIVE",
          pendingExpiresAt: null,
          expiredAt: null,
          updatedAt: now,
        })
        .where(eq(user.id, existingUser.id));

      await db
        .update(organization)
        .set({
          status: "ACTIVE",
          expiredAt: null,
          updatedAt: now,
        })
        .where(eq(organization.id, userMember.organizationId));

      return c.json({
        success: true,
        organizationSlug: org.slug,
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
