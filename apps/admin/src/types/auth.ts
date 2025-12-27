import type { z } from "zod";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSearchSchema,
  resetPasswordSearchSchema,
} from "../schemas/auth";

export type LoginFormData = z.infer<typeof loginSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type LoginSearchParams = z.infer<typeof loginSearchSchema>;
export type ResetPasswordSearchParams = z.infer<
  typeof resetPasswordSearchSchema
>;
