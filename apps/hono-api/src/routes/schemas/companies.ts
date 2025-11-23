import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  subdomain: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, {
      message:
        "Subdomain must contain only lowercase letters, numbers, and hyphens",
    }),
});

export const listCompaniesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
