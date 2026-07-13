import { z } from "zod";
import { enterpriseDetailsSchema } from "../schemas/enterpriseDetails.js";

export const checkoutBodySchema = z.object({
  plan: z.enum(["basic", "premium", "enterprise"]),
  currency: z.enum(["brl", "usd"]).default("brl"),
  enterpriseDetails: enterpriseDetailsSchema.optional(),
});
