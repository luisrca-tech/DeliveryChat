import { z } from "zod";

const MAX_MESSAGE_LENGTH = 10000;

export const roomJoinSchema = z.object({
  conversationId: z.string().uuid(),
  lastMessageId: z.string().uuid().optional(),
});

export const roomLeaveSchema = z.object({
  conversationId: z.string().uuid(),
});

export const messageSendSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  clientMessageId: z.string().min(1),
});

export const wsClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room:join"), payload: roomJoinSchema }),
  z.object({ type: z.literal("room:leave"), payload: roomLeaveSchema }),
  z.object({ type: z.literal("message:send"), payload: messageSendSchema }),
  z.object({ type: z.literal("ping") }),
]);

export type ParsedWSClientEvent = z.infer<typeof wsClientEventSchema>;
