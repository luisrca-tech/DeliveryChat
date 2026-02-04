import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for admin app.
 * Variables are loaded from Infisical via native integration in Vercel.
 */
export const env = createEnv({
  server: {},
  client: {
    VITE_RESEND_EMAIL_TO: z.string().email(),
    VITE_API_URL: z.string().url(),
  },
  clientPrefix: "VITE_",
  runtimeEnv: {
    VITE_RESEND_EMAIL_TO: import.meta.env.VITE_RESEND_EMAIL_TO,
    VITE_API_URL: import.meta.env.VITE_API_URL,
  },
  skipValidation: !!import.meta.env.SKIP_ENV_VALIDATION,
});
