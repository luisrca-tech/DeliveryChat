import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables schema for hono-api.
 * Secrets are loaded from Infisical via CLI (infisical run).
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    PORT: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    RESEND_API_KEY: z.string().min(1),
    RESEND_EMAIL_TO: z.string().email(),
    ALLOWED_ORIGINS: z
      .string()
      .optional()
      .transform((v) => (v ? JSON.parse(v) : []))
      .pipe(z.array(z.string())),
    EMAIL_FROM: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().min(1),
    SIGNING_STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_BASIC_PRICE_KEY: z.string().min(1),
    STRIPE_PREMIUM_PRICE_KEY: z.string().min(1),
    STRIPE_ENTERPRISE_PRODUCT_KEY: z.string().min(1),
    STRIPE_AI_ADDON_PRICE_KEY: z.string().min(1),
    STRIPE_AUTOMATIC_TAX_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    WS_TOKEN_SECRET: z.string().min(32),
    SECRETS_ENCRYPTION_KEY: z
      .string()
      .min(1)
      .refine((v) => Buffer.from(v, "base64").length === 32, {
        message: "SECRETS_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
      }),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    AI_MODEL: z.string().min(1).default("nvidia/nemotron-3-super-120b-a12b:free"),
    AI_INTERVIEW_MODEL: z.string().min(1).default("nvidia/nemotron-3-super-120b-a12b:free"),
    AI_CONTEXT_MESSAGE_LIMIT: z
      .string()
      .optional()
      .default("10")
      .transform((v) => Number.parseInt(v, 10))
      .pipe(z.number().int().positive()),
  },
  client: {
    // Add client-side env vars here if needed
  },
  clientPrefix: "",
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_EMAIL_TO: process.env.RESEND_EMAIL_TO,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    SIGNING_STRIPE_SECRET_KEY: process.env.SIGNING_STRIPE_SECRET_KEY,
    STRIPE_BASIC_PRICE_KEY: process.env.STRIPE_BASIC_PRICE_KEY,
    STRIPE_PREMIUM_PRICE_KEY: process.env.STRIPE_PREMIUM_PRICE_KEY,
    STRIPE_ENTERPRISE_PRODUCT_KEY: process.env.STRIPE_ENTERPRISE_PRODUCT_KEY,
    STRIPE_AI_ADDON_PRICE_KEY: process.env.STRIPE_AI_ADDON_PRICE_KEY,
    STRIPE_AUTOMATIC_TAX_ENABLED: process.env.STRIPE_AUTOMATIC_TAX_ENABLED,
    WS_TOKEN_SECRET: process.env.WS_TOKEN_SECRET,
    SECRETS_ENCRYPTION_KEY: process.env.SECRETS_ENCRYPTION_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    AI_INTERVIEW_MODEL: process.env.AI_INTERVIEW_MODEL,
    AI_CONTEXT_MESSAGE_LIMIT: process.env.AI_CONTEXT_MESSAGE_LIMIT,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
