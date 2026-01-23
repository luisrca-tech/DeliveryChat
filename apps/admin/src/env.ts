import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for admin app.
 * Variables are loaded from Infisical via native integration in Vercel.
 */
export const env = createEnv({
  server: {},
  client: {
    VITE_API_URL: z.string().url(),
    VITE_BETTER_AUTH_URL: z.string().url(),
    VITE_TENANT_DOMAIN: z.string().optional(),
    VITE_RESEND_EMAIL_TO: z.string().email(),
  },
  clientPrefix: "VITE_",
  runtimeEnv: {
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_BETTER_AUTH_URL: import.meta.env.VITE_BETTER_AUTH_URL,
    VITE_TENANT_DOMAIN: import.meta.env.VITE_TENANT_DOMAIN,
    VITE_RESEND_EMAIL_TO: import.meta.env.VITE_RESEND_EMAIL_TO,
  },
  skipValidation: !!import.meta.env.SKIP_ENV_VALIDATION,
});
