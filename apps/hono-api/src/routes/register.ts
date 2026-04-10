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

      console.info("[Register] Starting registration for:", {
        email,
        name,
        companyName,
        subdomain,
      });

      console.info("[Register] Step 1: Checking existing user...");
      const existingUsers = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      const existingUser = existingUsers[0] ?? null;
      console.info("[Register] Step 1 done. Existing user:", existingUser ? { id: existingUser.id, status: existingUser.status } : null);

      console.info("[Register] Step 2: Checking existing org...");
      const existingOrgs = await db
        .select()
        .from(organization)
        .where(eq(organization.slug, subdomain))
        .limit(1);
      const existingOrg = existingOrgs[0] ?? null;
      console.info("[Register] Step 2 done. Existing org:", existingOrg ? { id: existingOrg.id, status: existingOrg.status } : null);

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

      const isReactivatingUser =
        existingUser &&
        (existingUser.status === "DELETED" ||
          existingUser.status === "EXPIRED");

      let userId: string;
      let signUpHeaders: Headers | undefined;

      console.info("[Register] Step 3: signupAction =", signupAction, "| isReactivatingUser =", isReactivatingUser);

      if (isReactivatingUser) {
        userId = existingUser.id;

        await db
          .update(user)
          .set({
            name,
            status: "PENDING_VERIFICATION",
            pendingExpiresAt: pendingExpiresAt.toISOString(),
            expiredAt: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(user.id, userId));

        await db.transaction(async (tx) => {
          await tx.delete(account).where(eq(account.userId, userId));
          await tx.delete(session).where(eq(session.userId, userId));
        });

        try {
          const bcrypt = await import("bcrypt");
          const hashedPassword = await bcrypt.default.hash(password, 10);

          const accountId = `credential_${userId}`;
          await db.insert(account).values({
            id: accountId,
            userId,
            accountId: email,
            providerId: "credential",
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (bcryptError) {
          console.error(
            "[Register] Failed to hash password - bcrypt not available:",
            bcryptError,
          );
          return jsonError(
            c,
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
            "Password hashing failed. Please install bcrypt: bun add bcrypt @types/bcrypt",
          );
        }

        signUpHeaders = undefined;
      } else {
        let signUpResult;
        try {
          console.info("[Register] Step 4: Calling auth.api.signUpEmail for:", email);
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
          console.info("[Register] Step 4 done. signUpResult user:", signUpResult?.user?.id ?? "NO USER ID");
        } catch (error) {
          console.error("[Register] Step 4 FAILED - auth.api.signUpEmail error:", error instanceof APIError ? { status: error.status, message: error.message } : error);
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
          console.error("[Register] Step 4 FAILED - No user ID in signUpResult:", JSON.stringify(signUpResult));
          return jsonError(
            c,
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
            "User creation failed",
          );
        }

        userId = signUpResult.user.id;
      }

      if (!isReactivatingUser) {
        console.info("[Register] Step 5: Setting user status to PENDING_VERIFICATION for userId:", userId);
        await db
          .update(user)
          .set({
            status: "PENDING_VERIFICATION",
            pendingExpiresAt: pendingExpiresAt.toISOString(),
          })
          .where(eq(user.id, userId));
        console.info("[Register] Step 5 done.");
      }

      const isReactivatingOrg =
        existingOrg &&
        (existingOrg.status === "DELETED" || existingOrg.status === "EXPIRED");

      let orgId: string;
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      if (isReactivatingOrg) {
        orgId = existingOrg.id;

        await db
          .update(organization)
          .set({
            name: companyName,
            status: "PENDING_VERIFICATION",
            expiredAt: null,
            planStatus: "trialing",
            trialEndsAt: trialEndsAt.toISOString(),
            billingEmail: email,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(organization.id, orgId));

        const existingMembers = await db
          .select()
          .from(member)
          .where(
            and(eq(member.organizationId, orgId), eq(member.userId, userId)),
          )
          .limit(1);

        if (existingMembers.length === 0) {
          const memberId = `member_${orgId}_${userId}`;
          await db.insert(member).values({
            id: memberId,
            organizationId: orgId,
            userId,
            role: "super_admin",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        try {
          const orgHeaders = new Headers(c.req.raw.headers);
          if (signUpHeaders) {
            const setCookie = signUpHeaders.get("set-cookie");
            if (setCookie) {
              orgHeaders.set("cookie", setCookie);
              console.info("[Register] Step 6: Forwarding session cookie to createOrganization");
            } else {
              console.warn("[Register] Step 6: No set-cookie header from signUp — createOrganization may fail without auth session");
            }
          } else {
            console.warn("[Register] Step 6: No signUpHeaders — createOrganization may fail without auth session");
          }

          console.info("[Register] Step 6: Calling auth.api.createOrganization for:", { companyName, subdomain });
          const orgResponse = await auth.api.createOrganization({
            body: {
              name: companyName,
              slug: subdomain,
            },
            headers: orgHeaders,
          });
          console.info("[Register] Step 6 done. orgResponse:", orgResponse?.id ? { id: orgResponse.id } : orgResponse);

          if (orgResponse?.id) {
            orgId = orgResponse.id;
            await db
              .update(organization)
              .set({
                status: "PENDING_VERIFICATION",
                planStatus: "trialing",
                trialEndsAt: trialEndsAt.toISOString(),
                billingEmail: email,
              })
              .where(eq(organization.id, orgId));
          } else {
            throw new Error("Organization creation failed");
          }
        } catch (error) {
          console.error("[Register] Step 6 FAILED - createOrganization error:", error instanceof APIError ? { status: error.status, message: error.message } : error);
          try {
            console.info("[Register] Rolling back user creation for userId:", userId);
            await db.transaction(async (tx) => {
              await tx.delete(account).where(eq(account.userId, userId));
              await tx.delete(session).where(eq(session.userId, userId));
              await tx.delete(user).where(eq(user.id, userId));
            });
            console.info("[Register] Rollback complete");
          } catch (deleteError) {
            console.error(
              "[Register] Failed to delete account and session:",
              deleteError,
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
      }

      try {
        console.info("[Register] Step 7: Sending verification OTP to:", email);
        await auth.api.sendVerificationOTP({
          body: {
            email,
            type: "email-verification",
          },
          headers: c.req.raw.headers,
        });
        console.info("[Register] Step 7 done. OTP sent successfully");
      } catch (error) {
        console.error("[Register] Step 7 FAILED - sendVerificationOTP error:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "Failed to send verification code",
        );
      }

      console.info("[Register] Step 8: Fetching final user record for userId:", userId);
      const userRecord = await db
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

      console.info("[Register] Registration complete. Returning OTP_SENT for:", email);
      return c.json({
        status: "OTP_SENT",
        success: true,
        user: userRecord[0] ?? { id: userId, email, name },
      });
    } catch (error) {
      console.error("[Register] UNHANDLED ERROR in registration flow:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  },
);
