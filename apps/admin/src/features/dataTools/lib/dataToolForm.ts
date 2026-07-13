import type { ParamRow } from "../components/ParamSchemaBuilder";
import type {
  DataSourceKind,
  DataTool,
  DataToolBody,
  ToolInputSchema,
} from "../types/dataTools.types";

/**
 * Pure form logic for `DataToolDialog` — validation, coercion, payload shaping,
 * and the test-before-enable gate. Kept free of React so each rule can be unit
 * tested in isolation; the dialog only wires state to these functions.
 */

/** A tool name must start with a letter, then letters/digits/underscores only. */
export const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Minimum description length — mirrored by the backend zod schema. */
export const MIN_DESCRIPTION_LENGTH = 10;

/** The raw form fields the save/build rules depend on. */
export type DataToolFormInputs = {
  effectiveKind: DataSourceKind | null;
  name: string;
  description: string;
  config: string;
  resolvedSchema: ToolInputSchema | null;
};

/**
 * Coerces a raw string test-input into the JSON type declared for its param.
 * Numbers that fail to parse fall back to the raw string (the backend then
 * reports the validation error), booleans are strict "true"/anything-else.
 */
export function coerceParam(row: ParamRow, raw: string): unknown {
  if (row.type === "boolean") return raw === "true";
  if (row.type === "number" || row.type === "integer") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

/** Coerces every row's value into a param map keyed by name. */
export function coerceParams(
  rows: ParamRow[],
  values: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    rows.map((row) => [row.name, coerceParam(row, values[row.name] ?? "")]),
  );
}

/** Whether the current form state satisfies every save precondition. */
export function canSaveDataTool(inputs: DataToolFormInputs): boolean {
  return (
    Boolean(inputs.effectiveKind) &&
    NAME_REGEX.test(inputs.name.trim()) &&
    inputs.description.trim().length >= MIN_DESCRIPTION_LENGTH &&
    inputs.config.trim().length > 0 &&
    inputs.resolvedSchema !== null
  );
}

/**
 * Builds the create/update payload, or returns null when any precondition is
 * unmet (same gate as {@link canSaveDataTool}). Discriminates the `config`
 * shape on the backing kind.
 */
export function buildDataToolBody(
  inputs: DataToolFormInputs,
): DataToolBody | null {
  const { effectiveKind, name, description, config, resolvedSchema } = inputs;
  if (!effectiveKind) return null;
  if (!name.trim() || !NAME_REGEX.test(name.trim())) return null;
  if (description.trim().length < MIN_DESCRIPTION_LENGTH) return null;
  if (!config.trim()) return null;
  if (!resolvedSchema) return null;

  const base = {
    name: name.trim(),
    description: description.trim(),
    inputSchema: resolvedSchema,
  };

  return effectiveKind === "http"
    ? {
        ...base,
        backingType: "http",
        config: { method: "GET", urlTemplate: config.trim() },
      }
    : {
        ...base,
        backingType: "sql",
        config: { query: config.trim() },
      };
}

/**
 * Security-relevant gate: a tool may only be enabled after a successful test
 * request, tracked server-side via `lastTestedAt`.
 */
export function canEnableTool(tool: DataTool | null): boolean {
  return Boolean(tool?.lastTestedAt);
}
