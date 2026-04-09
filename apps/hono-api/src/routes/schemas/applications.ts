import { z } from "zod";

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

export const createApplicationSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z
    .string()
    .min(1)
    .max(255)
    .regex(DOMAIN_REGEX, {
      message:
        "Domain must be a valid hostname (e.g. app.example.com or *.example.com)",
    }),
  description: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

export const updateApplicationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
