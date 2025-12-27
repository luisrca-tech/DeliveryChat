import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";

dotenv.config();

if (!env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. " +
      "Run with Infisical: infisical run --env=dev --path=/hono-api -- drizzle-kit generate",
  );
}

const maskedUrl = env.DATABASE_URL.replace(/:[^:@]+@/, ":****@");
console.info("[Drizzle Config] Database URL:", maskedUrl);
try {
  const url = new URL(env.DATABASE_URL);
  console.info("[Drizzle Config] Database host:", url.hostname);
  console.info("[Drizzle Config] Database port:", url.port || "5432 (default)");
  console.info(
    "[Drizzle Config] Database name:",
    url.pathname.split("/").pop(),
  );
} catch (error) {
  console.warn("[Drizzle Config] Could not parse DATABASE_URL");
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
