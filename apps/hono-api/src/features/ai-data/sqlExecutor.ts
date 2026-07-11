import { Pool } from "pg";
import { decryptSecret } from "../../lib/crypto/secretBox.js";
import { orderedParamNames } from "./paramValidator.js";
import { hasLimitClause, validateSqlQuery } from "./sqlValidator.js";
import type { DataToolResult, ExecuteDataToolInput } from "./types.js";

const STATEMENT_TIMEOUT_MS = 5000;
const POOL_MAX_CONNECTIONS = 2;
const MAX_POOLS = 20;
const DEFAULT_ROW_LIMIT = 50;
const MAX_RESULT_BYTES = 256 * 1024; // 256 KB

type SqlSourceConfig = { encryptedConnectionString: string };
type SqlToolConfig = { query: string };

/**
 * Per-application connection pools. FIFO eviction beyond MAX_POOLS: the oldest
 * pool is ended and dropped when a new application needs a pool. Insertion order
 * of a Map is preserved, so the first key is the oldest.
 */
const pools = new Map<string, Pool>();

function getPool(applicationId: string, connectionString: string): Pool {
  const existing = pools.get(applicationId);
  if (existing) return existing;

  if (pools.size >= MAX_POOLS) {
    const oldestKey = pools.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      const evicted = pools.get(oldestKey);
      pools.delete(oldestKey);
      // Fire-and-forget close; log (never the connection string) on failure.
      void evicted?.end().catch((error: unknown) => {
        console.error("[ai-data.sql] failed to end evicted pool", {
          error: error instanceof Error ? error.message : undefined,
        });
      });
    }
  }

  const pool = new Pool({
    connectionString,
    max: POOL_MAX_CONNECTIONS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  pools.set(applicationId, pool);
  return pool;
}

/**
 * Execute a SQL-backed DataTool.
 *
 * Read-only by construction: only the stored query text is executed, with
 * positional bind params mapped from the validated params in the schema's
 * property order. Errors are RETURNED, never thrown.
 */
export async function executeSqlTool(
  input: Pick<ExecuteDataToolInput, "applicationId" | "tool" | "source" | "params">,
): Promise<DataToolResult> {
  const sourceConfig = input.source.config as SqlSourceConfig;
  const toolConfig = input.tool.config as SqlToolConfig;

  // Defense-in-depth: re-validate the stored query before running it.
  const validation = validateSqlQuery(toolConfig.query);
  if (!validation.ok) {
    console.error("[ai-data.sql] stored query failed validation", {
      tool: input.tool.name,
      error: validation.error,
    });
    return { ok: false, kind: "execution", error: validation.error };
  }

  // Map validated params to positional binds in schema property order.
  const values = orderedParamNames(input.tool.inputSchema).map(
    (name) => input.params[name],
  );

  // Enforce a row cap: append LIMIT when the query does not declare one.
  const query = hasLimitClause(toolConfig.query)
    ? toolConfig.query
    : `${toolConfig.query.replace(/;\s*$/, "")} LIMIT ${DEFAULT_ROW_LIMIT}`;

  let connectionString: string;
  try {
    connectionString = decryptSecret(sourceConfig.encryptedConnectionString);
  } catch (error) {
    console.error("[ai-data.sql] connection string decryption failed", {
      tool: input.tool.name,
      error: error instanceof Error ? error.message : undefined,
    });
    return {
      ok: false,
      kind: "execution",
      error: "Failed to prepare database connection",
    };
  }

  let rows: unknown[];
  try {
    const pool = getPool(input.applicationId, connectionString);
    const result = await pool.query(query, values);
    rows = result.rows;
  } catch (error) {
    if (isTimeoutError(error)) {
      console.error("[ai-data.sql] query timed out", { tool: input.tool.name });
      return { ok: false, kind: "timeout", error: "Query timed out" };
    }
    // Never log the connection string or values.
    console.error("[ai-data.sql] query execution failed", {
      tool: input.tool.name,
      error: error instanceof Error ? error.message : undefined,
    });
    return { ok: false, kind: "execution", error: "Query execution failed" };
  }

  // Cap serialized result size.
  const serialized = JSON.stringify(rows);
  if (serialized.length > MAX_RESULT_BYTES) {
    return { ok: false, kind: "execution", error: "Result set too large" };
  }

  return { ok: true, data: rows };
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    // pg raises "canceling statement due to statement timeout".
    return /statement timeout/i.test(error.message);
  }
  return false;
}

/** Test-only helper: close and clear all pooled connections. */
export async function __resetPoolsForTest(): Promise<void> {
  const all = [...pools.values()];
  pools.clear();
  await Promise.all(all.map((pool) => pool.end().catch(() => undefined)));
}
