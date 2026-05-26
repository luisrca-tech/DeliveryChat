import { z } from "zod";

export const generateReplyBodySchema = z.object({
  conversationId: z.string().uuid(),
});

export const improveMessageBodySchema = z.object({
  conversationId: z.string().uuid(),
  draft: z.string().min(1).max(4000),
});

const aiActionFilter = z.enum(["generate", "improve"]);
const aiStatusFilter = z.enum([
  "success",
  "provider_error",
  "timeout",
  "empty",
  "content_filtered",
  "aborted",
]);

export const listAiUsageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  action: aiActionFilter.optional(),
  status: aiStatusFilter.optional(),
  userId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
