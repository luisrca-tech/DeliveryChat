import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
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
  listConversationsForVisitor,
} from "../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../features/chat/error-mapper.js";
import { requireParticipant } from "../features/chat/participant-guard.js";
import { resolveOrCreateVisitor } from "../features/chat/visitor.service.js";
import {
  buildConversationNewEvent,
  buildMessageNewEvent,
  broadcastOrganizationEvent,
} from "../features/chat/broadcasting.service.js";

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

type RawParticipant = {
  userId: string;
  role: string;
  joinedAt: string;
};

type RawConversation = {
  id: string;
  status: string;
  subject: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  participants: RawParticipant[];
};

type RawMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  editedAt: string | null;
  createdAt: string;
};

function mapParticipant(p: RawParticipant) {
  return { userId: p.userId, role: p.role, joinedAt: p.joinedAt };
}

function mapConversation(raw: RawConversation) {
  return {
    id: raw.id,
    status: raw.status,
    subject: raw.subject,
    assignedTo: raw.assignedTo,
    participants: raw.participants.map(mapParticipant),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function mapMessage(raw: RawMessage) {
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    senderId: raw.senderId,
    content: raw.content,
    editedAt: raw.editedAt,
    createdAt: raw.createdAt,
  };
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

    const visitorUserId = await resolveOrCreateVisitor(visitorId);
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

      broadcastOrganizationEvent(
        apiAuth.application.organizationId,
        buildConversationNewEvent({
          id: conversation.id,
          organizationId: apiAuth.application.organizationId,
          applicationId: apiAuth.application.id,
          status: "pending",
          subject: subject ?? null,
          createdAt: conversation.createdAt,
        }),
      );

      const withParticipants = await getConversationWithParticipants(
        conversation.id,
        apiAuth.application.organizationId,
      );

      return c.json({ conversation: mapConversation(withParticipants as RawConversation) }, 201);
    },
  )

  // GET /conversations
  .get("/conversations", zValidator("query", paginationQuery), async (c) => {
    const apiAuth = getApiAuth(c)!;
    const visitor = c.get("visitor") as VisitorContext;
    const { limit, offset } = c.req.valid("query");

    const result = await listConversationsForVisitor({
      applicationId: apiAuth.application.id,
      organizationId: apiAuth.application.organizationId,
      visitorUserId: visitor.visitorUserId,
      limit,
      offset,
    });

    return c.json({
      conversations: result.conversations,
      total: result.total,
      limit,
      offset,
    });
  })

  // Participant guard for all conversation-scoped routes
  .use("/conversations/:id", requireParticipant())
  .use("/conversations/:id/*", requireParticipant())

  // GET /conversations/:id
  .get("/conversations/:id", async (c) => {
    const apiAuth = getApiAuth(c)!;
    const conversationId = c.req.param("id");

    const conversation = await getConversationWithParticipants(
      conversationId,
      apiAuth.application.organizationId,
    );

    if (!conversation) {
      return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
    }

    return c.json({ conversation: mapConversation(conversation as RawConversation) });
  })

  // GET /conversations/:id/messages
  .get(
    "/conversations/:id/messages",
    zValidator("query", paginationQuery),
    async (c) => {
      const conversationId = c.req.param("id");
      const { limit, offset } = c.req.valid("query");

      const msgs = await getMessageHistory({ conversationId, limit, offset });
      return c.json({ messages: msgs.map(mapMessage), limit, offset });
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

      try {
        const message = await sendMessage({
          conversationId,
          senderId: visitor.visitorUserId,
          content,
        });

        const apiAuth = getApiAuth(c)!;
        broadcastOrganizationEvent(
          apiAuth.application.organizationId,
          buildMessageNewEvent({
            id: message.id,
            conversationId,
            senderId: visitor.visitorUserId,
            senderName: "Visitor",
            senderRole: "visitor",
            content: message.content,
            type: "text",
            createdAt: message.createdAt,
          }),
        );

        return c.json({ message: mapMessage(message) }, 201);
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
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

      try {
        const message = await editMessage({
          messageId,
          conversationId,
          senderId: visitor.visitorUserId,
          content,
        });
        return c.json({ message: mapMessage(message) });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  // DELETE /conversations/:id/messages/:messageId
  .delete("/conversations/:id/messages/:messageId", async (c) => {
    const visitor = c.get("visitor") as VisitorContext;
    const conversationId = c.req.param("id");
    const messageId = c.req.param("messageId");

    try {
      await deleteMessage({
        messageId,
        conversationId,
        senderId: visitor.visitorUserId,
      });
      return c.json({ success: true });
    } catch (error) {
      const mapped = mapServiceErrorToResponse(c, error);
      if (mapped) return mapped;
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

      await markAsRead(conversationId, visitor.visitorUserId, messageId);
      return c.json({ success: true });
    },
  )

  // GET /conversations/:id/unread
  .get("/conversations/:id/unread", async (c) => {
    const visitor = c.get("visitor") as VisitorContext;
    const conversationId = c.req.param("id");

    const unreadCount = await getUnreadCountForVisitor(conversationId, visitor.visitorUserId);
    return c.json({ unreadCount });
  });
