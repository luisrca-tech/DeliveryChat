import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const isBuildTime = typeof window === "undefined" && import.meta.env.SSR;
const requiredClientVarsMissing = !import.meta.env.PUBLIC_API_URL;

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    DEMO_CHAT_API_KEY: z.string().min(1),
    DEMO_CHAT_APP_ID: z.string().min(1),
  },
  client: {
    PUBLIC_API_URL: z.string().url(),
  },
  clientPrefix: "PUBLIC_",
  runtimeEnv: {
    NODE_ENV: import.meta.env.NODE_ENV,
    DEMO_CHAT_API_KEY: import.meta.env.DEMO_CHAT_API_KEY,
    DEMO_CHAT_APP_ID: import.meta.env.DEMO_CHAT_APP_ID,
    PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL,
  },
  skipValidation:
    !!import.meta.env.SKIP_ENV_VALIDATION ||
    (isBuildTime && requiredClientVarsMissing),
  emptyStringAsUndefined: true,
});
