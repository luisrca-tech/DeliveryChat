import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for admin app.
 * Variables are loaded from Infisical via native integration in Vercel.
 *
 * Note: For client-side code, use import.meta.env.PUBLIC_API_URL directly
 * as Vite replaces these at build time.
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
    // For client-side, Vite uses import.meta.env, not process.env
    // This is mainly for server-side validation
    PUBLIC_API_URL:
      typeof window === "undefined"
        ? process.env.PUBLIC_API_URL
        : import.meta.env.PUBLIC_API_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
