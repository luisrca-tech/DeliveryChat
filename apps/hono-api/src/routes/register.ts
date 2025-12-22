import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth } from "../lib/auth.js";
import { registerSchema } from "./schemas/register.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import { APIError } from "better-auth/api";
import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { organization } from "../db/schema/organization.js";
import { member } from "../db/schema/member.js";
import { account } from "../db/schema/account.js";
import { session } from "../db/schema/session.js";
import { eq, and } from "drizzle-orm";
import {
  resolveSignupAction,
  canReuseOrganizationSlug,
} from "../lib/accountLifecycle.js";
import { mapToHttpStatus } from "./utils/httpStatus.js";

export const registerRoute = new Hono().post(
  "/register",
  zValidator("json", registerSchema),
  async (c) => {
    try {
      const { email, password, name, companyName, subdomain } =
        c.req.valid("json");

      const existingUsers = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      const existingUser = existingUsers[0] ?? null;

      const existingOrgs = await db
        .select()
        .from(organization)
        .where(eq(organization.slug, subdomain))
        .limit(1);
      const existingOrg = existingOrgs[0] ?? null;

      const signupAction = resolveSignupAction(
        existingUser,
        existingUser?.pendingExpiresAt ?? null,
      );

      if (signupAction === "REJECT") {
        return jsonError(
          c,
          HTTP_STATUS.CONFLICT,
          ERROR_MESSAGES.CONFLICT,
          "Email already in use",
        );
      }

      if (signupAction === "RESEND_OTP") {
        if (existingOrg && existingUser) {
          const memberRecords = await db
            .select()
            .from(member)
            .where(
              and(
                eq(member.organizationId, existingOrg.id),
                eq(member.userId, existingUser.id),
              ),
            )
            .limit(1);

          if (memberRecords.length === 0) {
            const canReuseSlug = canReuseOrganizationSlug(existingOrg);
            if (!canReuseSlug) {
              return jsonError(
                c,
                HTTP_STATUS.CONFLICT,
                ERROR_MESSAGES.CONFLICT,
                "Subdomain already in use",
              );
            }
          }
        }

        try {
          await auth.api.sendVerificationOTP({
            body: {
              email,
              type: "email-verification",
            },
            headers: c.req.raw.headers,
          });

          return c.json({
            status: "PENDING_VERIFICATION_EXISTS",
            message: "Verification code resent",
          });
        } catch (error) {
          console.error("[Register] Failed to resend OTP:", error);
          return jsonError(
            c,
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
            "Failed to resend verification code",
          );
        }
      }

      const canReuseSlug = canReuseOrganizationSlug(existingOrg);
      if (!canReuseSlug && existingOrg) {
        return jsonError(
          c,
          HTTP_STATUS.CONFLICT,
          ERROR_MESSAGES.CONFLICT,
          "Subdomain already in use",
        );
      }

      const pendingExpiresAt = new Date();
      pendingExpiresAt.setDate(pendingExpiresAt.getDate() + 7);

      let signUpResult;
      let signUpHeaders: Headers | undefined;
      try {
        const signUpResponse = await auth.api.signUpEmail({
          body: {
            email,
            password,
            name,
          },
          headers: c.req.raw.headers,
          returnHeaders: true,
        });

        signUpResult = signUpResponse.response;
        signUpHeaders = signUpResponse.headers;
      } catch (error) {
        if (error instanceof APIError) {
          return jsonError(
            c,
            mapToHttpStatus(error.status),
            "Failed to create account",
            error.message,
          );
        }
        throw error;
      }

      if (!signUpResult?.user?.id) {
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "User creation failed",
        );
      }

      const userId = signUpResult.user.id;

      await db
        .update(user)
        .set({
          status: "PENDING_VERIFICATION",
          pendingExpiresAt: pendingExpiresAt.toISOString(),
        })
        .where(eq(user.id, userId));

      try {
        const orgHeaders = new Headers(c.req.raw.headers);
        if (signUpHeaders) {
          const setCookie = signUpHeaders.get("set-cookie");
          if (setCookie) {
            orgHeaders.set("cookie", setCookie);
          }
        }

        const orgResponse = await auth.api.createOrganization({
          body: {
            name: companyName,
            slug: subdomain,
          },
          headers: orgHeaders,
        });

        if (orgResponse?.id) {
          await db
            .update(organization)
            .set({
              status: "PENDING_VERIFICATION",
            })
            .where(eq(organization.id, orgResponse?.id));
        }
      } catch (error) {
        try {
          await db.transaction(async (tx) => {
            await tx.delete(account).where(eq(account.userId, userId));
            await tx.delete(session).where(eq(session.userId, userId));
            await tx.delete(user).where(eq(user.id, userId));
          });
        } catch (error) {
          console.error(
            "[Register] Failed to delete account and session:",
            error,
          );
        }

        if (error instanceof APIError) {
          return jsonError(
            c,
            mapToHttpStatus(error.status),
            "Failed to create organization",
            error.message,
          );
        }
        throw error;
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
        console.error("[Register] Failed to send OTP:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "Failed to send verification code",
        );
      }

      return c.json({
        status: "OTP_SENT",
        success: true,
        user: signUpResult.user,
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
