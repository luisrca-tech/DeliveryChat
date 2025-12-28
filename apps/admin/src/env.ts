import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for admin app.
 * Variables are loaded from Infisical via native integration in Vercel.
 */
export const env = createEnv({
  server: {},
  client: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    VITE_API_URL: z.string().url(),
    VITE_BETTER_AUTH_URL: z.string().url(),
    VITE_WEB_APP_URL: z.string().url(),
    VITE_TENANT_DOMAIN: z.string().optional(),
  },
  clientPrefix: "",
  runtimeEnv: {
    NODE_ENV: import.meta.env.NODE_ENV,
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_BETTER_AUTH_URL: import.meta.env.VITE_BETTER_AUTH_URL,
    VITE_WEB_APP_URL: import.meta.env.VITE_WEB_APP_URL,
    VITE_TENANT_DOMAIN: import.meta.env.VITE_TENANT_DOMAIN,
  },
  skipValidation: !!import.meta.env.SKIP_ENV_VALIDATION,
});
