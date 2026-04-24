import { z } from "zod";

const conversationStatusEnum = z.enum(["pending", "active", "closed"]);

export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: z
    .union([conversationStatusEnum, z.array(conversationStatusEnum)])
    .optional()
    .transform((v) =>
      v === undefined ? undefined : Array.isArray(v) ? v : [v],
    ),
  applicationId: z.string().uuid().optional(),
  assignedTo: z.enum(["me"]).optional(),
});

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const updateConversationStatusSchema = z.object({
  status: z.enum(["closed"]),
});

export const updateConversationSubjectSchema = z.object({
  subject: z.string().trim().min(1).max(500),
});

export const addParticipantSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["visitor", "operator", "admin"]),
});

export const createWidgetConversationSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
});
