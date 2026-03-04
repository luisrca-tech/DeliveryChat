import { z } from "zod";

export const updateRateLimitsSchema = z.object({
  requestsPerSecond: z.number().int().positive().nullable().optional(),
  requestsPerMinute: z.number().int().positive().nullable().optional(),
  requestsPerHour: z.number().int().positive().nullable().optional(),
});
