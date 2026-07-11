import type { applicationDataSource } from "../../../db/schema/applicationDataSource.js";
import type { applicationDataTool } from "../../../db/schema/applicationDataTool.js";

export type DataSourceSelect = typeof applicationDataSource.$inferSelect;
export type DataToolSelect = typeof applicationDataTool.$inferSelect;

/** Max serialized size of test-request data echoed back to the admin UI. */
const TEST_RESPONSE_BYTE_CAP = 10 * 1024; // ~10 KB

type HttpSourceConfig = {
  baseUrl: string;
  allowedHost: string;
  encryptedHeaders?: Record<string, string>;
};

type SqlSourceConfig = {
  encryptedConnectionString: string;
};

/**
 * Public, secret-free view of a DataSource. Secret fields
 * (`encryptedHeaders`, `encryptedConnectionString`) are NEVER included — only
 * booleans / header names that let the UI show configured state.
 */
export type RedactedDataSource =
  | {
      kind: "http";
      enabled: boolean;
      baseUrl: string;
      allowedHost: string;
      hasHeaders: boolean;
      headerNames: string[];
      createdAt: string;
      updatedAt: string;
    }
  | {
      kind: "sql";
      enabled: boolean;
      hasConnectionString: boolean;
      createdAt: string;
      updatedAt: string;
    };

/** Strip every secret from a DataSource row before returning it to a client. */
export function redactDataSource(row: DataSourceSelect): RedactedDataSource {
  if (row.kind === "http") {
    const config = row.config as HttpSourceConfig;
    const headerNames = Object.keys(config.encryptedHeaders ?? {});
    return {
      kind: "http",
      enabled: row.enabled,
      baseUrl: config.baseUrl,
      allowedHost: config.allowedHost,
      hasHeaders: headerNames.length > 0,
      headerNames,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  const config = row.config as SqlSourceConfig;
  return {
    kind: "sql",
    enabled: row.enabled,
    hasConnectionString: Boolean(config.encryptedConnectionString),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** DataTool config carries no secrets, so it is returned verbatim. */
export function serializeDataTool(row: DataToolSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    inputSchema: row.inputSchema,
    backingType: row.backingType,
    config: row.config,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Cap the size of test-request data echoed to the UI. Large payloads are
 * replaced with a truncated string preview so the response stays bounded.
 */
export function truncateTestData(
  data: unknown,
):
  | { data: unknown; truncated: false }
  | { dataPreview: string; truncated: true } {
  let serialized: string;
  try {
    serialized = JSON.stringify(data) ?? "null";
  } catch {
    // Non-serializable (circular, BigInt, …) — return a safe string preview.
    return { dataPreview: String(data).slice(0, TEST_RESPONSE_BYTE_CAP), truncated: true };
  }
  if (serialized.length > TEST_RESPONSE_BYTE_CAP) {
    return { dataPreview: serialized.slice(0, TEST_RESPONSE_BYTE_CAP), truncated: true };
  }
  return { data, truncated: false };
}
