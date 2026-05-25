import { z } from "zod";

export const generateReplyBodySchema = z.object({
  conversationId: z.string().uuid(),
});
