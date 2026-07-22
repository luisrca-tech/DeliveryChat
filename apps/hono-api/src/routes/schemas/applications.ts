import { z } from "zod";

// Kept local because hono-api only resolves @repo/types for type-only imports at runtime.
// Canonical source: packages/types/src/validation/domain.ts
const DOMAIN_REGEX =
  /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export const listApplicationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  offset: z.coerce.number().int().min(0).optional().default(0),
  hasMyConversations: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

const productionApplicationSchema = z.object({
  kind: z.literal("production").optional().default("production"),
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255).regex(DOMAIN_REGEX, {
    message:
      "Domain must be a valid hostname (e.g. app.example.com or *.example.com)",
  }),
  description: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

const testApplicationSchema = z.object({
  kind: z.literal("test"),
  name: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  description: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

export const createApplicationSchema = z
  .union([productionApplicationSchema, testApplicationSchema])
  .transform((data) =>
    data.kind === "test"
      ? { ...data, domain: "localhost" as const }
      : { ...data, port: null },
  );

const allowedOriginEntry = z
  .string()
  .min(1)
  .max(255)
  .transform((v) => v.toLowerCase())
  .pipe(
    z.string().regex(DOMAIN_REGEX, {
      message:
        "Each entry must be a valid hostname (e.g. app.example.com or *.example.com)",
    }),
  );

export const updateApplicationSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    allowedOrigins: z
      .array(allowedOriginEntry)
      .refine((arr) => new Set(arr).size === arr.length, {
        message: "Duplicate entries are not allowed",
      })
      .optional(),
    aiAutoRespond: z.boolean().optional(),
    aiDbEnabled: z.boolean().optional(),
  })
  .strict();
