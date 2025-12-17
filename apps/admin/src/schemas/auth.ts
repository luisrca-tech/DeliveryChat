import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Email is too long")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(256, "Password is too long"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Email is too long")
    .email("Please enter a valid email address"),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(256, "Password is too long"),
    confirmPassword: z
      .string()
      .min(1, "Please confirm your password")
      .max(256, "Password is too long"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSearchSchema = z.object({
  error: z.string().trim().max(500, "Value is too long").optional(),
  message: z.string().trim().max(500, "Value is too long").optional(),
  redirect: z.string().trim().max(2048, "Value is too long").optional(),
});

export const resetPasswordSearchSchema = z.object({
  token: z.string().trim().max(1024, "Token is too long").optional(),
});
