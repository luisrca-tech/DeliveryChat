import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

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
    VITE_API_URL: z.string().url(),
    VITE_BETTER_AUTH_URL: z.string().url(),
    VITE_BETTER_AUTH_SECRET: z.string().min(1), // Secret string, not a URL
  },
  clientPrefix: "",
  runtimeEnv: {
    NODE_ENV: import.meta.env.NODE_ENV,
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_BETTER_AUTH_URL: import.meta.env.VITE_BETTER_AUTH_URL,
    VITE_BETTER_AUTH_SECRET: import.meta.env.VITE_BETTER_AUTH_SECRET,
  },
  skipValidation: !!import.meta.env.SKIP_ENV_VALIDATION,
});
