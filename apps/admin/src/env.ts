import { createEnv, z } from "@repo/types";

/**
 * Environment variables schema for admin app.
 * Variables are loaded from Infisical via native integration in Vercel.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
  },
  client: {
    PUBLIC_API_URL: z.string().url().optional(),
  },
  clientPrefix: "PUBLIC_",
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_API_URL: process.env.PUBLIC_API_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
