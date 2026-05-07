import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { conversations } from "../db/schema/conversations.js";
import { conversationParticipants } from "../db/schema/conversationParticipants.js";
import { signWsToken } from "../lib/security/wsToken.js";
import { env } from "../env.js";
import { requireApiKeyAuth, getApiAuth } from "../lib/middleware/apiKeyAuth.js";
import { createVisitorRateLimitMiddleware } from "../lib/middleware/visitorRateLimit.js";
import { sharedVisitorRateLimiter } from "../lib/middleware/visitorRateLimitInstance.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import {
  createConversation,
  getConversationWithParticipants,
  getMessageHistory,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  getUnreadCountForVisitor,
  isParticipant,
  MessageNotFoundError,
  NotMessageSenderError,
  MessageEditWindowExpiredError,
  ConversationNotFoundError,
  ConversationNotActiveError,
} from "../features/chat/chat.service.js";
import { roomManager } from "./ws.js";
import type { WSServerEvent } from "@repo/types";

type Variables = {
  visitor: VisitorContext;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const sendMessageBody = z.object({
  content: z.string().trim().min(1).max(5000),
});

const editMessageBody = z.object({
  content: z.string().trim().min(1).max(5000),
});

const markAsReadBody = z.object({
  messageId: z.string().uuid(),
});

const createConversationBody = z.object({
  subject: z.string().trim().min(1).max(500).optional(),
});

type VisitorContext = {
  visitorId: string;
  visitorUserId: string;
};

async function resolveVisitor(visitorId: string): Promise<string> {
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, visitorId))
    .limit(1);

  if (existingUser) return existingUser.id;

  await db.insert(user).values({
    id: visitorId,
    name: "Visitor",
    email: `${visitorId}@anonymous.deliverychat.online`,
    isAnonymous: true,
    status: "ACTIVE",
  });

  return visitorId;
}

export const publicApiRoute = new Hono<{ Variables: Variables }>()
  .use("*", requireApiKeyAuth())
  .use("*", async (c, next) => {
    const visitorId = c.req.header("X-Visitor-Id")?.trim();

    if (!visitorId) {
      return jsonError(
        c,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.BAD_REQUEST,
        "X-Visitor-Id header required",
      );
    }

    if (!UUID_REGEX.test(visitorId)) {
      return jsonError(
        c,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.BAD_REQUEST,
        "X-Visitor-Id must be a valid UUID",
      );
    }

    const visitorUserId = await resolveVisitor(visitorId);
    c.set("visitor", { visitorId, visitorUserId } satisfies VisitorContext);
    await next();
  })
  .use("*", createVisitorRateLimitMiddleware(sharedVisitorRateLimiter))

  // POST /ws-token
  .post("/ws-token", async (c) => {
    const apiAuth = getApiAuth(c)!;
    const visitor = c.get("visitor") as VisitorContext;
    const origin = c.req.header("Origin") ?? "";

    const token = signWsToken(
      {
        appId: apiAuth.application.id,
        origin,
        visitorId: visitor.visitorId,
      },
      env.WS_TOKEN_SECRET,
    );

    return c.json({ token });
  })

  // POST /conversations
  .post(
    "/conversations",
    zValidator("json", createConversationBody),
    async (c) => {
      const apiAuth = getApiAuth(c)!;
      const visitor = c.get("visitor") as VisitorContext;
      const { subject } = c.req.valid("json");

      const conversation = await createConversation({
        organizationId: apiAuth.application.organizationId,
        applicationId: apiAuth.application.id,
        subject,
        createdBy: visitor.visitorUserId,
        participants: [{ userId: visitor.visitorUserId, role: "visitor" }],
      });

      const event: WSServerEvent = {
        type: "conversation:new",
        payload: {
          id: conversation.id,
          organizationId: apiAuth.application.organizationId,
          applicationId: apiAuth.application.id,
          status: "pending",
          subject: subject ?? null,
          createdAt: conversation.createdAt,
        },
      };
      roomManager.broadcastToOrganization(
        apiAuth.application.organizationId,
        JSON.stringify(event),
      );

      const withParticipants = await getConversationWithParticipants(
        conversation.id,
        apiAuth.application.organizationId,
      );

      return c.json({ conversation: withParticipants }, 201);
    },
  )

  // GET /conversations
  .get("/conversations", zValidator("query", paginationQuery), async (c) => {
    const apiAuth = getApiAuth(c)!;
    const visitor = c.get("visitor") as VisitorContext;
    const { limit, offset } = c.req.valid("query");

    const result = await db
      .select({
        id: conversations.id,
        status: conversations.status,
        subject: conversations.subject,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        and(
          eq(conversationParticipants.conversationId, conversations.id),
          eq(conversationParticipants.userId, visitor.visitorUserId),
          isNull(conversationParticipants.leftAt),
        ),
      )
      .where(
        and(
          eq(conversations.applicationId, apiAuth.application.id),
          eq(conversations.organizationId, apiAuth.application.organizationId),
          isNull(conversations.deletedAt),
        ),
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        and(
          eq(conversationParticipants.conversationId, conversations.id),
          eq(conversationParticipants.userId, visitor.visitorUserId),
          isNull(conversationParticipants.leftAt),
        ),
      )
      .where(
        and(
          eq(conversations.applicationId, apiAuth.application.id),
          eq(conversations.organizationId, apiAuth.application.organizationId),
          isNull(conversations.deletedAt),
        ),
      );

    return c.json({
      conversations: result,
      total: countRow?.total ?? 0,
      limit,
      offset,
    });
  })

  // GET /conversations/:id
  .get("/conversations/:id", async (c) => {
    const apiAuth = getApiAuth(c)!;
    const visitor = c.get("visitor") as VisitorContext;
    const conversationId = c.req.param("id");

    const conversation = await getConversationWithParticipants(
      conversationId,
      apiAuth.application.organizationId,
    );

    if (!conversation) {
      return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
    }

    const participantCheck = await isParticipant(conversationId, visitor.visitorUserId);
    if (!participantCheck) {
      return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
    }

    return c.json({ conversation });
  })

  // GET /conversations/:id/messages
  .get(
    "/conversations/:id/messages",
    zValidator("query", paginationQuery),
    async (c) => {
      const visitor = c.get("visitor") as VisitorContext;
      const conversationId = c.req.param("id");
      const { limit, offset } = c.req.valid("query");

      const participantCheck = await isParticipant(conversationId, visitor.visitorUserId);
      if (!participantCheck) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
      }

      const msgs = await getMessageHistory({ conversationId, limit, offset });
      return c.json({ messages: msgs, limit, offset });
    },
  )

  // POST /conversations/:id/messages
  .post(
    "/conversations/:id/messages",
    zValidator("json", sendMessageBody),
    async (c) => {
      const visitor = c.get("visitor") as VisitorContext;
      const conversationId = c.req.param("id");
      const { content } = c.req.valid("json");

      const participantCheck = await isParticipant(conversationId, visitor.visitorUserId);
      if (!participantCheck) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
      }

      try {
        const message = await sendMessage({
          conversationId,
          senderId: visitor.visitorUserId,
          content,
        });

        const apiAuth = getApiAuth(c)!;
        const event: WSServerEvent = {
          type: "message:new",
          payload: {
            id: message.id,
            conversationId,
            senderId: visitor.visitorUserId,
            senderName: "Visitor",
            senderRole: "visitor",
            content: message.content,
            type: "text",
            createdAt: message.createdAt,
          },
        };
        roomManager.broadcastToOrganization(
          apiAuth.application.organizationId,
          JSON.stringify(event),
        );

        return c.json({ message }, 201);
      } catch (error) {
        if (error instanceof ConversationNotFoundError) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
        }
        if (error instanceof ConversationNotActiveError) {
          return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "conversation_not_active", error.message);
        }
        throw error;
      }
    },
  )

  // PATCH /conversations/:id/messages/:messageId
  .patch(
    "/conversations/:id/messages/:messageId",
    zValidator("json", editMessageBody),
    async (c) => {
      const visitor = c.get("visitor") as VisitorContext;
      const conversationId = c.req.param("id");
      const messageId = c.req.param("messageId");
      const { content } = c.req.valid("json");

      const participantCheck = await isParticipant(conversationId, visitor.visitorUserId);
      if (!participantCheck) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
      }

      try {
        const message = await editMessage({
          messageId,
          conversationId,
          senderId: visitor.visitorUserId,
          content,
        });
        return c.json({ message });
      } catch (error) {
        if (error instanceof MessageNotFoundError) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Message not found");
        }
        if (error instanceof NotMessageSenderError) {
          return jsonError(c, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN, "You can only edit your own messages");
        }
        if (error instanceof MessageEditWindowExpiredError) {
          return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "edit_window_expired", error.message);
        }
        throw error;
      }
    },
  )

  // DELETE /conversations/:id/messages/:messageId
  .delete("/conversations/:id/messages/:messageId", async (c) => {
    const visitor = c.get("visitor") as VisitorContext;
    const conversationId = c.req.param("id");
    const messageId = c.req.param("messageId");

    const participantCheck = await isParticipant(conversationId, visitor.visitorUserId);
    if (!participantCheck) {
      return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
    }

    try {
      await deleteMessage({
        messageId,
        conversationId,
        senderId: visitor.visitorUserId,
      });
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof MessageNotFoundError) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Message not found");
      }
      if (error instanceof NotMessageSenderError) {
        return jsonError(c, HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN, "You can only delete your own messages");
      }
      if (error instanceof MessageEditWindowExpiredError) {
        return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "edit_window_expired", error.message);
      }
      throw error;
    }
  })

  // POST /conversations/:id/read
  .post(
    "/conversations/:id/read",
    zValidator("json", markAsReadBody),
    async (c) => {
      const visitor = c.get("visitor") as VisitorContext;
      const conversationId = c.req.param("id");
      const { messageId } = c.req.valid("json");

      const participantCheck = await isParticipant(conversationId, visitor.visitorUserId);
      if (!participantCheck) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
      }

      await markAsRead(conversationId, visitor.visitorUserId, messageId);
      return c.json({ success: true });
    },
  )

  // GET /conversations/:id/unread
  .get("/conversations/:id/unread", async (c) => {
    const visitor = c.get("visitor") as VisitorContext;
    const conversationId = c.req.param("id");

    const participantCheck = await isParticipant(conversationId, visitor.visitorUserId);
    if (!participantCheck) {
      return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
    }

    const unreadCount = await getUnreadCountForVisitor(conversationId, visitor.visitorUserId);
    return c.json({ unreadCount });
  });
