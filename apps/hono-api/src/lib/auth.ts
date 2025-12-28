import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, emailOTP } from "better-auth/plugins";
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
import { sendVerificationOTPEmail, sendResetPasswordEmail } from "./email.js";

const trustedOrigins = createTrustedOrigins();
const baseURL = getAuthBaseURL(env);

async function getUserAdminUrl(
  userId: string,
  requestHost: string | null
): Promise<string> {
  try {
    const result = await db
      .select({
        slug: organizationSchema.slug,
      })
      .from(member)
      .innerJoin(
        organizationSchema,
        eq(member.organizationId, organizationSchema.id)
      )
      .where(eq(member.userId, userId))
      .limit(1);

    if (result.length === 0 || !result[0]?.slug) {
      throw new Error(
        "User has no organization membership or organization has no slug"
      );
    }

    const subdomain = result[0].slug;

    if (requestHost?.endsWith(".localhost") || env.NODE_ENV === "development") {
      return `http://${subdomain}.localhost:3000`;
    }

    if (requestHost?.endsWith(".vercel.app")) {
      return `https://${subdomain}.${requestHost}`;
    }

    if (!env.TENANT_DOMAIN) {
      throw new Error("TENANT_DOMAIN is required in production");
    }

    return `https://${subdomain}.${env.TENANT_DOMAIN}`;
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
        const host = request?.headers.get("host") ?? null;
        const adminBaseUrl = await getUserAdminUrl(user.id, host);
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
  advanced: getAdvancedOptions(env),
});

export type Session = typeof auth.$Infer.Session;
