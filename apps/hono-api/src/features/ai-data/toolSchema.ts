import { z } from "zod";

/**
 * Single seam for a stored DataTool `inputSchema` (a jsonb column).
 *
 * The concept "a flat object of scalar tool params" is consumed in four ways
 * that MUST stay in agreement:
 *   1. `toZod` — the flat Zod object handed to the LLM tool definitions.
 *   2. `validateParams` — runtime validation of model-provided params.
 *   3. `orderedParamNames` — the positional order the SQL executor relies on to
 *      map params to `$1..$n` bind placeholders.
 *   4. `toolInputSchema` — the save-time Zod validator for the CRUD route.
 *
 * All four read the stored schema through this module, so its invariants (flat,
 * scalar, insertion-ordered properties) live in one place instead of being
 * re-encoded per reader. The ordering invariant relied on by the SQL executor is
 * asserted by the cross-reader test in `__tests__/toolSchema.test.ts`.
 */

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Runtime param validation ─────────────────────────────────────────────────

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

// ── LLM-facing Zod builder ───────────────────────────────────────────────────

/**
 * Build a flat Zod object schema from a stored tool `inputSchema`. Only scalar
 * properties are supported (mirrors the executor's flat-schema contract).
 */
export function toZod(inputSchema: unknown): z.ZodTypeAny {
  const schema = normalizeSchema(inputSchema);
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, prop] of Object.entries(properties)) {
    let field: z.ZodTypeAny;
    switch (prop.type) {
      case "number":
        field = z.number();
        break;
      case "integer":
        field = z.number().int();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "string":
      default:
        field = z.string();
        break;
    }
    shape[name] = required.has(name) ? field : field.optional();
  }

  return z.object(shape);
}

// ── Save-time Zod validator (CRUD route) ─────────────────────────────────────

/**
 * Flat JSON Schema for a tool's `inputSchema`. Nested objects/arrays are NOT
 * allowed — the model-facing tools only take scalar arguments (mirrors the
 * executor's `ToolPropertySchema` constraint above).
 */
const toolPropertySchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean"]),
});

export const toolInputSchema = z
  .object({
    type: z.literal("object").optional(),
    properties: z.record(z.string(), toolPropertySchema).default({}),
    required: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const propNames = Object.keys(value.properties);
    for (const name of value.required ?? []) {
      if (!propNames.includes(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `required references unknown property "${name}"`,
          path: ["required"],
        });
      }
    }
  });
