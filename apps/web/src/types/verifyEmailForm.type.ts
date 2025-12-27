import type { verifyEmailSchema } from "src/schemas/verifyEmail.schema";
import type { z } from "zod";

export type VerifyEmailFormData = z.infer<typeof verifyEmailSchema>;
