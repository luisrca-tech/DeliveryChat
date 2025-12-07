import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for admin app.
 * Variables are loaded from Infisical via native integration in Vercel.
 */
const isServer = typeof window === "undefined";

// Debug: Log environment variables before validation
if (isServer) {
  console.log("[ENV] Server-side env validation:", {
    NODE_ENV: process.env.NODE_ENV,
    VITE_API_URL: process.env.VITE_API_URL ? "✓ Set" : "✗ Not set",
    VERCEL: process.env.VERCEL ? "✓ Yes" : "✗ No",
    VERCEL_ENV: process.env.VERCEL_ENV,
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION,
  });
} else {
  console.log("[ENV] Client-side env validation:", {
    VITE_API_URL: import.meta.env.VITE_API_URL ? "✓ Set" : "✗ Not set",
    DEV: import.meta.env.DEV,
    MODE: import.meta.env.MODE,
  });
}

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
  },
  client: {
    VITE_API_URL: z.string().url().optional(),
  },
  clientPrefix: "VITE_",
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    VITE_API_URL: process.env.VITE_API_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

// Debug: Log validated env
if (isServer) {
  console.log("[ENV] Validated server env:", {
    NODE_ENV: env.NODE_ENV,
  });
} else {
  console.log("[ENV] Validated client env:", {
    VITE_API_URL: env.VITE_API_URL || "undefined",
  });
}
