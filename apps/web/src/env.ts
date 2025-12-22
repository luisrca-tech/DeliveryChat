import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for web (landing page) app.
 * Variables are loaded from Infisical via native integration in Vercel.
 * In Astro, client-side env vars must use PUBLIC_ prefix.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
  },
  client: {
    PUBLIC_API_URL: z.string().url(),
  },
  clientPrefix: "PUBLIC_",
  runtimeEnv: {
    NODE_ENV: import.meta.env.NODE_ENV,
    PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL,
  },
  skipValidation: !!import.meta.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
