import { z } from "zod";

export const enterpriseDetailsSchema = z
  .object({
    fullName: z.string().min(1).max(200),
    email: z.string().email(),
    phone: z.string().min(1).max(50).optional(),
    teamSize: z.coerce.number().int().min(1).max(1_000_000).optional(),
    notes: z.string().min(1).max(4000).optional(),
  })
  .strict();
