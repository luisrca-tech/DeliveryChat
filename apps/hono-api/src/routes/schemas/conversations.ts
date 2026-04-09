import { z } from "zod";

export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(["pending", "active", "closed"]).optional(),
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
