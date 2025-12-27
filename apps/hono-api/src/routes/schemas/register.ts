import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  name: z.string().min(1).max(256),
  companyName: z.string().min(1).max(256),
  subdomain: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(256),
});
