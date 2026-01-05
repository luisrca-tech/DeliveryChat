import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  name: z.string().min(1).max(256),
  companyName: z.string().min(1).max(256),
  subdomain: z
    .string()
    .toLowerCase()
    .trim()
    .min(1, "Subdomain is required")
    .max(256, "Subdomain must be 256 characters or less")
    .regex(
      /^[a-z0-9-]+$/,
      "Only lowercase letters, numbers, and hyphens allowed"
    )
    .refine(
      (val) => !val.startsWith("-") && !val.endsWith("-"),
      "Subdomain cannot start or end with a hyphen"
    )
    .refine(
      (val) => !val.includes("--"),
      "Subdomain cannot contain consecutive hyphens"
    ),
});
