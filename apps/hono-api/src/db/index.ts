import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { env } from "../env.js";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

/**
 * Database URL is loaded from Infisical.
 *
 * When using Infisical CLI (`infisical run --path=/hono-api`),
 * secrets are automatically injected as environment variables.
 *
 * Infisical environments: dev, staging, prod
 */
const databaseUrl = env.DATABASE_URL;

const maskedUrl = databaseUrl.replace(/:[^:@]+@/, ":****@");
console.log(`[Infisical] ✅ DATABASE_URL loaded: ${maskedUrl}`);

try {
  const url = new URL(databaseUrl);
  console.log(`[Infisical] Database host: ${url.hostname}`);
} catch (error) {
  console.warn(`[Infisical] ⚠️  Invalid DATABASE_URL format: ${maskedUrl}`);
  console.warn(
    `[Infisical] Error:`,
    error instanceof Error ? error.message : "Unknown error"
  );
  console.warn(
    `[Infisical] The database connection may fail. Expected format: postgresql://user:password@host:port/database`
  );
}

const conn = globalForDb.conn ?? postgres(databaseUrl);
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema: { ...schema } });
