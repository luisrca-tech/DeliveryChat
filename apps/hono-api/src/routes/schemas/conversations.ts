import { z } from "zod";

export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(["active", "closed", "archived"]).optional(),
  type: z.enum(["support", "internal"]).optional(),
  applicationId: z.string().uuid().optional(),
});

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const createInternalConversationSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  applicationId: z.string().uuid().optional(),
  participantUserIds: z.array(z.string().min(1)).min(1),
});

export const updateConversationStatusSchema = z.object({
  status: z.enum(["closed", "archived"]),
});

export const addParticipantSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["visitor", "operator", "admin"]),
});

export const createWidgetConversationSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
});
