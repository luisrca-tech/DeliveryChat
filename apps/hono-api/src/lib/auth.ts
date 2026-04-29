import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  anonymous,
  bearer,
  organization,
  emailOTP,
} from "better-auth/plugins";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { member } from "../db/schema/member.js";
import { user } from "../db/schema/users.js";
import { invitation } from "../db/schema/invitation.js";
import { organization as organizationSchema } from "../db/schema/organization.js";
import { eq, and, sql } from "drizzle-orm";
import { env } from "../env.js";
import { ac, super_admin, admin, operator } from "./permissions.js";
import { getMemberLimitByPlan } from "./planLimits.js";
import { createTrustedOrigins } from "./auth/origins.js";
import { getAuthBaseURL } from "./auth/baseUrl.js";
import { getAdvancedOptions } from "./auth/advanced.js";
import {
  getUiHostFromHeaders,
  getUiOriginFromHeaders,
} from "./requestContext.js";
import {
  sendPasswordChangedEmail,
  sendResetPasswordEmail,
  sendVerificationOTPEmail,
  sendOrganizationInvitationEmail,
} from "./email/index.js";

const trustedOrigins = createTrustedOrigins();
const baseURL = getAuthBaseURL(env);

export async function getUserAdminUrl(
  userId: string,
  headers: Headers,
): Promise<string> {
  try {
    const result = await db
      .select({
        slug: organizationSchema.slug,
      })
      .from(member)
      .innerJoin(
        organizationSchema,
        eq(member.organizationId, organizationSchema.id),
      )
      .where(eq(member.userId, userId))
      .limit(1);

    if (result.length === 0 || !result[0]?.slug) {
      throw new Error(
        "User has no organization membership or organization has no slug",
      );
    }

    const subdomain = result[0].slug;

    const uiOrigin = getUiOriginFromHeaders(headers);
    const uiHost = getUiHostFromHeaders(headers);

    const protocol = (() => {
      if (uiOrigin) {
        try {
          return new URL(uiOrigin).protocol;
        } catch {
          return null;
        }
      }
      if (
        uiHost === "localhost" ||
        uiHost?.startsWith("localhost:") ||
        uiHost?.endsWith(".localhost") ||
        uiHost?.includes(".localhost:")
      ) {
        return "http:";
      }
      return "https:";
    })();

    if (
      uiHost === "localhost" ||
      uiHost?.startsWith("localhost:") ||
      uiHost?.endsWith(".localhost") ||
      uiHost?.includes(".localhost:")
    ) {
      return `http://${subdomain}.localhost:3000`;
    }

    if (uiHost?.endsWith(".vercel.app")) {
      const hostname = uiHost.split(":")[0]?.toLowerCase() ?? "";
      const labels = hostname.split(".").filter(Boolean);
      const first = labels[0] ?? "";
      const rest = labels.slice(1).join(".");

      if (first.includes("---")) {
        const suffix = first.split("---").slice(1).join("---");
        const deploymentHost = `${suffix}.${rest}`;
        return `${protocol}//${subdomain}---${deploymentHost}`;
      }

      return `${protocol}//${subdomain}---${hostname}`;
    }

    const hostname = (uiHost ?? "").split(":")[0]?.toLowerCase() ?? "";
    const parts = hostname.split(".").filter(Boolean);
    const baseDomain = parts.length <= 2 ? hostname : parts.slice(1).join(".");
    return `${protocol}//${subdomain}.${baseDomain}`;
  } catch (error) {
    console.error("[Auth] Error building admin URL:", error);
    throw error;
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    async sendResetPassword({ user, token }, request) {
      try {
        const headers = request?.headers ?? new Headers();
        const adminBaseUrl = await getUserAdminUrl(user.id, headers);
        const resetUrl = `${adminBaseUrl}/reset-password?token=${token}`;

        await sendResetPasswordEmail({
          email: user.email,
          url: resetUrl,
          userName: user.name || undefined,
        });
      } catch (error) {
        console.error("[Auth] Failed to send reset password email:", error);
        throw error;
      }
    },
    async onPasswordReset({ user }, request) {
      console.info("[Auth] Password reset successfully for user:", user.email);
      const tz = request?.headers?.get("X-Timezone")?.trim();
      try {
        await sendPasswordChangedEmail({
          email: user.email,
          occurredAt: new Date().toISOString(),
          timeZone: tz || undefined,
        });
      } catch (error) {
        console.error("[Auth] Failed to send password changed email:", error);
      }
    },
  },
  plugins: [
    anonymous({
      emailDomainName: "anonymous.deliverychat.online",
    }),
    bearer({ requireSignature: true }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: false,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "email-verification") {
          try {
            await sendVerificationOTPEmail({ email, otp });
          } catch (error) {
            console.error("[Auth] Failed to send OTP email:", error);
            throw error;
          }
        }
      },
    }),
    organization({
      ac,
      roles: {
        super_admin,
        admin,
        operator,
      },
      async sendInvitationEmail(data) {
        console.info("[Auth] Sending invitation email to:", data.email, "for org:", data.organization.name, "role:", data.role);
        // Link points to the admin frontend, which calls acceptInvitation client-side
        const orgSlug = data.organization.slug;
        const isDev = process.env.NODE_ENV !== "production";
        const adminHost = isDev
          ? `http://${orgSlug}.localhost:3000`
          : `https://${orgSlug}.deliverychat.online`;
        const inviteLink = `${adminHost}/accept-invitation?invitationId=${data.id}`;
        try {
          await sendOrganizationInvitationEmail({
            email: data.email,
            inviterName: data.inviter.user.name,
            organizationName: data.organization.name,
            role: data.role,
            inviteLink,
          });
          console.info("[Auth] Invitation email sent successfully to:", data.email);
        } catch (error) {
          console.error("[Auth] Failed to send invitation email:", error);
        }
      },
      schema: {
        organization: {
          additionalFields: {
            plan: {
              type: "string",
              required: false,
              defaultValue: "FREE",
              input: false,
            },
          },
        },
      },
      organizationHooks: {
        beforeCreateOrganization: async ({ organization }) => {
          return {
            data: {
              ...organization,
              plan: "FREE" as const,
            },
          };
        },
        beforeCreateInvitation: async ({ invitation, organization: org }) => {
          const plan = (org as { plan?: string }).plan ?? "FREE";
          const limit = getMemberLimitByPlan(plan);

          const [countResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(member)
            .where(eq(member.organizationId, org.id));

          const currentCount = countResult?.count ?? 0;
          if (currentCount >= limit) {
            throw new Error(
              `Your ${plan} plan allows up to ${limit} members. Please upgrade to add more.`,
            );
          }

          return { data: invitation };
        },
        beforeAddMember: async ({ member }) => {
          if (member.role === "owner") {
            return {
              data: {
                ...member,
                role: "super_admin" as const,
              },
            };
          }
          return { data: member };
        },
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          // If this user was created to accept a pending invitation,
          // activate them immediately — the invite email itself
          // serves as email verification.
          const [pendingInvite] = await db
            .select({ id: invitation.id })
            .from(invitation)
            .where(
              and(
                eq(invitation.email, createdUser.email),
                eq(invitation.status, "pending"),
              ),
            )
            .limit(1);

          if (pendingInvite) {
            console.info("[Auth:databaseHooks] Activating invited user:", createdUser.id, createdUser.email);
            await db
              .update(user)
              .set({ status: "ACTIVE" })
              .where(eq(user.id, createdUser.id));
          }
        },
      },
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins,
  advanced: getAdvancedOptions(env, baseURL),
});

export type Session = typeof auth.$Infer.Session;
