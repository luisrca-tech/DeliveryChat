import { executeHttpTool } from "./httpExecutor.js";
import { executeSqlTool } from "./sqlExecutor.js";
import { validateParams } from "./paramValidator.js";
import type { DataToolResult, ExecuteDataToolInput } from "./types.js";

export { executeHttpTool } from "./httpExecutor.js";
export { executeSqlTool } from "./sqlExecutor.js";
export { validateParams, orderedParamNames } from "./paramValidator.js";
export { validateSqlQuery, hasLimitClause } from "./sqlValidator.js";
export { isPrivateAddress } from "./ssrfGuard.js";
export type {
  DataToolResult,
  DataToolErrorKind,
  ExecuteDataToolInput,
  DataToolRow,
  DataSourceRow,
  ToolInputSchema,
} from "./types.js";

/**
 * Run an admin-configured, strictly read-only DataTool.
 *
 * Validates `params` against the tool's stored `inputSchema`, then dispatches to
 * the HTTP or SQL backing executor. All failures are RETURNED as
 * `{ ok: false, ... }` (never thrown) so the AI turn can feed them into
 * escalation; internal diagnostics are logged by the executors.
 */
export async function executeDataTool(
  input: ExecuteDataToolInput,
): Promise<DataToolResult> {
  const validation = validateParams(input.tool.inputSchema, input.params);
  if (!validation.ok) {
    return { ok: false, kind: "validation", error: validation.error };
  }

  switch (input.tool.backingType) {
    case "http":
      return executeHttpTool(input);
    case "sql":
      return executeSqlTool(input);
    default:
      return {
        ok: false,
        kind: "execution",
        error: `Unsupported tool backing: ${String(input.tool.backingType)}`,
      };
  }
}
