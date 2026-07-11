import type { DataSourceConfig } from "../../db/schema/applicationDataSource.js";
import type { DataToolConfig } from "../../db/schema/applicationDataTool.js";

/**
 * Backing kind shared by a DataSource and the DataTools defined on top of it.
 * Mirrors the `data_source_kind` pg enum (`http` | `sql`).
 */
export type DataSourceKind = "http" | "sql";

/**
 * Minimal JSON Schema shape supported for tool input validation.
 *
 * Constraint (documented, intentional): tool input schemas are FLAT objects of
 * primitive properties. Nested objects/arrays are NOT supported — the model-
 * facing tools only take scalar arguments. See docs/data-tool-executors.md.
 */
export type ToolPropertyType = "string" | "number" | "integer" | "boolean";

export interface ToolPropertySchema {
  type: ToolPropertyType;
}

export interface ToolInputSchema {
  type?: "object";
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
}

/** Row shape (subset) of `applicationDataTool` needed by the executors. */
export interface DataToolRow {
  name: string;
  backingType: DataSourceKind;
  inputSchema: unknown;
  config: DataToolConfig;
}

/** Row shape (subset) of `applicationDataSource` needed by the executors. */
export interface DataSourceRow {
  kind: DataSourceKind;
  config: DataSourceConfig;
}

export interface ExecuteDataToolInput {
  /** Keys the per-application SQL connection pool. Required for `sql` tools. */
  applicationId: string;
  tool: DataToolRow;
  source: DataSourceRow;
  /** Model-provided arguments, validated against `tool.inputSchema`. */
  params: Record<string, unknown>;
}

export type DataToolErrorKind = "validation" | "execution" | "timeout";

export type DataToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; kind: DataToolErrorKind };
