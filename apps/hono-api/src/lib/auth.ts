import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, organization, emailOTP } from "better-auth/plugins";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { member } from "../db/schema/member.js";
import { organization as organizationSchema } from "../db/schema/organization.js";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { ac, super_admin, admin, operator } from "./permissions.js";
import { createTrustedOrigins } from "./auth/origins.js";
import { getAuthBaseURL } from "./auth/baseUrl.js";
import { getAdvancedOptions } from "./auth/advanced.js";
import {
  getUiHostFromHeaders,
  getUiOriginFromHeaders,
} from "./requestContext.js";
import { sendVerificationOTPEmail, sendResetPasswordEmail } from "./email.js";

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
    async onPasswordReset({ user }) {
      console.info("[Auth] Password reset successfully for user:", user.email);
    },
  },
  plugins: [
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
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins,
  advanced: getAdvancedOptions(env, baseURL),
});

export type Session = typeof auth.$Infer.Session;
