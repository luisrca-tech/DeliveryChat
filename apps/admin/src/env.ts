import { createEnv, z } from "@repo/types";

/**
 * Environment variables schema for admin app.
 * Secrets are loaded from Infisical via CLI (infisical run).
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
  },
  client: {
    // Add client-side env vars here (e.g., NEXT_PUBLIC_API_URL)
  },
  clientPrefix: "",
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
