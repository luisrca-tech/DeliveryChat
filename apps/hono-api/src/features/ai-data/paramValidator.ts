import type { ToolInputSchema, ToolPropertySchema } from "./types.js";

export type ParamValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validate model-provided `params` against a stored tool `inputSchema`.
 *
 * Deliberately minimal: no external JSON Schema dependency is used (none exists
 * in the workspace and adding one is out of scope). Tool schemas are FLAT
 * objects of primitives — this validator covers exactly that:
 *   - `required` fields must be present and non-null.
 *   - each provided property declared in `properties` must match its declared
 *     primitive type (`string | number | integer | boolean`).
 *   - unknown properties (not in `properties`) are ignored.
 *
 * The returned `value` echoes the input params unchanged (no coercion) so the
 * caller can map them positionally in the schema's property order.
 */
export function validateParams(
  inputSchema: unknown,
  params: Record<string, unknown>,
): ParamValidationResult {
  const schema = normalizeSchema(inputSchema);
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const name of required) {
    const value = params[name];
    if (value === undefined || value === null) {
      return { ok: false, error: `Missing required parameter: ${name}` };
    }
  }

  for (const [name, prop] of Object.entries(properties)) {
    const value = params[name];
    if (value === undefined || value === null) {
      // Optional & absent — skip. Presence of required is enforced above.
      continue;
    }
    const typeError = checkType(name, prop, value);
    if (typeError) {
      return { ok: false, error: typeError };
    }
  }

  return { ok: true, value: params };
}

function checkType(
  name: string,
  prop: ToolPropertySchema,
  value: unknown,
): string | null {
  switch (prop.type) {
    case "string":
      return typeof value === "string"
        ? null
        : `Parameter "${name}" must be a string`;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `Parameter "${name}" must be a number`;
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
        ? null
        : `Parameter "${name}" must be an integer`;
    case "boolean":
      return typeof value === "boolean"
        ? null
        : `Parameter "${name}" must be a boolean`;
    default:
      return `Parameter "${name}" has unsupported schema type`;
  }
}

function normalizeSchema(inputSchema: unknown): ToolInputSchema {
  if (
    inputSchema === null ||
    typeof inputSchema !== "object" ||
    Array.isArray(inputSchema)
  ) {
    return {};
  }
  return inputSchema as ToolInputSchema;
}

/**
 * Ordered list of property names as declared in the schema. Used by the SQL
 * executor to map validated params to positional bind params ($1..$n)
 * deterministically. Object key insertion order is preserved by JS engines and
 * by the stored jsonb, which is what we rely on.
 */
export function orderedParamNames(inputSchema: unknown): string[] {
  const schema = normalizeSchema(inputSchema);
  return Object.keys(schema.properties ?? {});
}
