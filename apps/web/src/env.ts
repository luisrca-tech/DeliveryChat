import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for web (landing page) app.
 * Secrets are loaded from Infisical via CLI (infisical run).
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
  },
  client: {
    PUBLIC_API_URL: z.string().url(),
    PUBLIC_BETTER_AUTH_URL: z.string().url(),
    PUBLIC_BETTER_AUTH_SECRET: z.string().min(1),
  },
  clientPrefix: "",
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_API_URL: process.env.PUBLIC_API_URL,
    PUBLIC_BETTER_AUTH_URL: process.env.PUBLIC_BETTER_AUTH_URL,
    PUBLIC_BETTER_AUTH_SECRET: process.env.PUBLIC_BETTER_AUTH_SECRET,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
