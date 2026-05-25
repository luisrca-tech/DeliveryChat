import { z } from "zod";

export const generateReplyBodySchema = z.object({
  conversationId: z.string().uuid(),
});

export const improveMessageBodySchema = z.object({
  conversationId: z.string().uuid(),
  draft: z.string().min(1).max(4000),
});
