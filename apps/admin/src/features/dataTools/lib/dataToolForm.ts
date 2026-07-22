import { z } from "zod";
import {
  paramRowsToSchema,
  schemaToParamRows,
  type ParamRow,
} from "../components/ParamSchemaBuilder";
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

/** RHF form values for the data-tool dialog, validated by zodResolver. */
export const dataToolFormSchema = z
  .object({
    name: z.string().trim().regex(NAME_REGEX, {
      message:
        "Must start with a letter; letters, digits, and underscores only.",
    }),
    description: z
      .string()
      .trim()
      .min(MIN_DESCRIPTION_LENGTH, {
        message: `At least ${MIN_DESCRIPTION_LENGTH} characters.`,
      }),
    config: z.string().trim().min(1),
    rawJsonMode: z.boolean(),
    rawJsonText: z.string(),
    paramRows: z.array(
      z.object({
        name: z.string(),
        type: z.enum(["string", "number", "integer", "boolean"]),
        required: z.boolean(),
      }),
    ),
  })
  .superRefine((values, ctx) => {
    if (!values.rawJsonMode) return;
    try {
      JSON.parse(values.rawJsonText);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rawJsonText"],
        message: "Invalid JSON",
      });
    }
  });

export type DataToolFormValues = z.infer<typeof dataToolFormSchema>;

/** Maps a saved tool (or null, for the create flow) to RHF default values. */
export function toDataToolFormValues(
  tool: DataTool | null,
): DataToolFormValues {
  return {
    name: tool?.name ?? "",
    description: tool?.description ?? "",
    config: tool
      ? tool.backingType === "http"
        ? tool.config.urlTemplate
        : tool.config.query
      : "",
    rawJsonMode: false,
    rawJsonText: JSON.stringify(
      tool?.inputSchema ?? { properties: {} },
      null,
      2,
    ),
    paramRows: tool ? schemaToParamRows(tool.inputSchema) : [],
  };
}

/**
 * The inputSchema the form currently expresses — from the guided builder rows,
 * or the raw JSON text (null when unparseable; parseable-but-malformed JSON is
 * deliberately accepted here and rejected by the backend schema on save).
 */
export function resolveToolSchema(
  values: Pick<DataToolFormValues, "rawJsonMode" | "rawJsonText" | "paramRows">,
): ToolInputSchema | null {
  if (values.rawJsonMode) {
    try {
      return JSON.parse(values.rawJsonText);
    } catch {
      return null;
    }
  }
  return paramRowsToSchema(values.paramRows);
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
        // URLs are single-line; strip line breaks pasted into the config
        // textarea. Remaining whitespace is rejected by the backend schema.
        config: {
          method: "GET",
          urlTemplate: config.trim().replace(/[\r\n]+/g, ""),
        },
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

/** What a single "Save changes" click must do, in order. */
export type DataToolSavePlan = {
  /** Create the tool, or persist edited fields. */
  saveFields: boolean;
  /** Apply the pending enabled/disabled switch via the enable endpoint. */
  applyStatus: boolean;
  /** A wanted enable could not be applied — the test gate is (or will be) unmet. */
  blockedEnable: boolean;
};

/**
 * Plans a save: field edits are persisted first, and a pending status change
 * is applied only when the test-before-enable gate still holds. Saving fields
 * resets `enabled`/`lastTestedAt` server-side, so an enable wanted alongside a
 * field edit is always blocked until a fresh test succeeds.
 */
export function planDataToolSave(input: {
  savedTool: DataTool | null;
  fieldsDirty: boolean;
  enabled: boolean;
}): DataToolSavePlan {
  const { savedTool, fieldsDirty, enabled } = input;
  if (!savedTool) {
    return { saveFields: true, applyStatus: false, blockedEnable: false };
  }
  if (fieldsDirty) {
    return { saveFields: true, applyStatus: false, blockedEnable: enabled };
  }
  if (enabled === savedTool.enabled) {
    return { saveFields: false, applyStatus: false, blockedEnable: false };
  }
  const blocked = enabled && !canEnableTool(savedTool);
  return { saveFields: false, applyStatus: !blocked, blockedEnable: blocked };
}
