import { z } from "zod";

export const listApplicationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const createApplicationSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).max(255),
  subdomain: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, {
      message:
        "Subdomain must contain only lowercase letters, numbers, and hyphens",
    }),
  description: z.string().optional(),
  settings: z.record(z.any()).optional().default({}),
});
