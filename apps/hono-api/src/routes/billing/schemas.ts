import { z } from "zod";
import { enterpriseDetailsSchema } from "../schemas/enterpriseDetails.js";

export const checkoutBodySchema = z.object({
  plan: z.enum(["basic", "premium", "enterprise"]),
  enterpriseDetails: enterpriseDetailsSchema.optional(),
});
