import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { env } from "../env.js";
import { ac, owner, admin, operator } from "./permissions.js";

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
        owner,
        admin,
        operator,
      },
    }),
  ],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    cookiePrefix: "better-auth",
    cookieDomain:
      process.env.NODE_ENV === "production"
        ? ".delivery-chat.com" // Wildcard for subdomain SSO
        : undefined, // localhost doesn't support wildcard cookies
  },
});

export type Session = typeof auth.$Infer.Session;
