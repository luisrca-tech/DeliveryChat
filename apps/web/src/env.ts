import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for web (landing page) app.
 * Variables are loaded from Infisical via native integration in Vercel.
 * In Astro, client-side env vars must use PUBLIC_ prefix.
 */
const isBuildTime = typeof window === "undefined" && import.meta.env.SSR;
const requiredClientVarsMissing = !import.meta.env.PUBLIC_API_URL;

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    /** Live/test API key for the demo app (server-only; never PUBLIC_) */
    DEMO_CHAT_API_KEY: z.string().min(1).optional(),
    DEMO_CHAT_APP_ID: z.string().uuid().optional(),
  },
  client: {
    PUBLIC_API_URL: z.string().url(),
  },
  clientPrefix: "PUBLIC_",
  runtimeEnv: {
    NODE_ENV: import.meta.env.NODE_ENV,
    PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL,
    DEMO_CHAT_API_KEY: process.env.DEMO_CHAT_API_KEY,
    DEMO_CHAT_APP_ID: process.env.DEMO_CHAT_APP_ID,
  },
  skipValidation:
    !!import.meta.env.SKIP_ENV_VALIDATION ||
    (isBuildTime && requiredClientVarsMissing),
  emptyStringAsUndefined: true,
});
