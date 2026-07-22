import { z } from "zod";
import { toolInputSchema } from "../../../features/ai-data/toolSchema.js";

/** LLM-facing tool name: must be a valid identifier (starts with a letter). */
const TOOL_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * PUT /data-source body — discriminated on `kind`.
 *
 * Secrets are write-only: `headers` (http) and `connectionString` (sql) are
 * optional on update; when omitted, the handler preserves the existing
 * encrypted values. `allowedHost` must equal the host of `baseUrl` (SSRF
 * guardrail — enforced by the executor at runtime, validated here at save time).
 */
export const dataSourceBodySchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("http"),
      baseUrl: z.string().url(),
      allowedHost: z.string().min(1),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    z.object({
      kind: z.literal("sql"),
      connectionString: z.string().min(1).optional(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.kind !== "http") return;
    let host: string;
    try {
      host = new URL(value.baseUrl).hostname;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseUrl is not a valid URL",
        path: ["baseUrl"],
      });
      return;
    }
    if (host !== value.allowedHost) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowedHost must equal the host of baseUrl",
        path: ["allowedHost"],
      });
    }
  });

export type DataSourceBody = z.infer<typeof dataSourceBodySchema>;

const httpToolConfigSchema = z.object({
  method: z.literal("GET"),
  // URLs are single-line: whitespace (a common paste artifact from the admin
  // textarea) would silently produce a broken request at call time.
  urlTemplate: z
    .string()
    .min(1)
    .refine((v) => !/\s/.test(v), {
      message: "urlTemplate must not contain whitespace",
    }),
});

const sqlToolConfigSchema = z.object({
  query: z.string().min(1),
});

const toolBaseFields = {
  name: z.string().min(1).max(100).regex(TOOL_NAME_REGEX, {
    message:
      "name must start with a letter and contain only letters, digits, or underscores",
  }),
  description: z
    .string()
    .min(10, { message: "description must be at least 10 characters" }),
  inputSchema: toolInputSchema,
};

/** POST/PUT /data-tools body — discriminated on `backingType`. */
export const dataToolBodySchema = z.discriminatedUnion("backingType", [
  z.object({
    ...toolBaseFields,
    backingType: z.literal("http"),
    config: httpToolConfigSchema,
  }),
  z.object({
    ...toolBaseFields,
    backingType: z.literal("sql"),
    config: sqlToolConfigSchema,
  }),
]);

export type DataToolBody = z.infer<typeof dataToolBodySchema>;

export const testRequestBodySchema = z.object({
  params: z.record(z.string(), z.unknown()).default({}),
});

export type TestRequestBody = z.infer<typeof testRequestBodySchema>;

export const enableBodySchema = z.object({
  enabled: z.boolean(),
});

export type EnableBody = z.infer<typeof enableBodySchema>;
