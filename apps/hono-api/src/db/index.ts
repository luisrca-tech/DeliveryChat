import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

/**
 * Database URL is loaded from Infisical.
 *
 * When using Infisical CLI (`infisical run --env=dev --path=/hono-api`),
 * secrets are automatically injected as environment variables.
 *
 * Infisical environments: dev, staging, prod
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  const env = process.env.NODE_ENV || "development";
  throw new Error(
    `DATABASE_URL is not set for environment "${env}". ` +
      `Ensure you're running with Infisical CLI: ` +
      `infisical run --env=dev --path=/hono-api -- <command> ` +
      `or set DATABASE_URL as an environment variable.`
  );
}

const maskedUrl = databaseUrl.replace(/:\/\/[^:]+:[^@]+@/, (match) =>
  match.replace(/:[^@]+@/, ":****@")
);
console.log(`[Infisical] ✅ DATABASE_URL loaded: ${maskedUrl}`);
console.log(`[Infisical] Database host: ${new URL(databaseUrl).hostname}`);

const conn = globalForDb.conn ?? postgres(databaseUrl);
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema: { ...schema } });
