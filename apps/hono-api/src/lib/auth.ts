import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { env } from "../env.js";
import { ac, super_admin, admin, operator } from "./permissions.js";
import { createTrustedOrigins } from "./auth/origins.js";
import { getAuthBaseURL } from "./auth/baseUrl.js";
import { getAdvancedOptions } from "./auth/advanced.js";

const trustedOrigins = createTrustedOrigins();
const baseURL = getAuthBaseURL(env);

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
  },
  plugins: [
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
