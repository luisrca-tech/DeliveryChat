import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().max(255).optional(),
  environment: z.enum(["live", "test"]).optional().default("live"),
  expiresAt: z.string().datetime().optional(),
});

export const regenerateApiKeySchema = z.object({
  name: z.string().max(255).optional(),
  expiresAt: z.string().datetime().optional(),
});
