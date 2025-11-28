import { z } from "zod";

export const registrationSchema = z
  .object({
    companyName: z.string().min(1, "Company name is required").trim(),
    subdomain: z
      .string()
      .min(1, "Subdomain is required")
      .regex(
        /^[a-z0-9-]+$/,
        "Only lowercase letters, numbers, and hyphens allowed"
      ),
    fullName: z.string().min(1, "Full name is required").trim(),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegistrationFormData = z.infer<typeof registrationSchema>;
