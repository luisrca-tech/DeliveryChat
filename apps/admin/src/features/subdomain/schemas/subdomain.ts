import { z } from "zod";

export const subdomainSchema = z.object({
  subdomain: z
    .string()
    .toLowerCase()
    .trim()
    .min(1, "Subdomain is required")
    .regex(
      /^[a-z0-9-]+$/,
      "Only lowercase letters, numbers, and hyphens allowed",
    )
    .refine(
      (val) => !val.startsWith("-") && !val.endsWith("-"),
      "Subdomain cannot start or end with a hyphen",
    )
    .refine(
      (val) => !val.includes("--"),
      "Subdomain cannot contain consecutive hyphens",
    ),
});
