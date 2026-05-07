import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages } from "../db/schema/messages.js";
import { signWsToken } from "../lib/security/wsToken.js";
import { env } from "../env.js";
import { user } from "../db/schema/users.js";
import { conversations } from "../db/schema/conversations.js";
import { getApplicationSettings } from "../features/applications/application.service.js";
import {
  createConversation,
  getUnreadCountForVisitor,
  markAsRead,
} from "../features/chat/chat.service.js";
import { resolveOrCreateVisitor } from "../features/chat/visitor.service.js";
import { requireWidgetAuth, getWidgetAuth } from "../lib/middleware/widgetAuth.js";
import { createVisitorRateLimitMiddleware } from "../lib/middleware/visitorRateLimit.js";
import { sharedVisitorRateLimiter } from "../lib/middleware/visitorRateLimitInstance.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import {
  createWidgetConversationSchema,
  getMessagesQuerySchema,
} from "./schemas/conversations.js";
import { roomManager } from "./ws.js";
import type { WSServerEvent } from "@repo/types";

export const widgetRoute = new Hono()
  .get("/settings/:appId", async (c) => {
    const appId = c.req.param("appId");
    if (!appId) {
      return jsonError(
        c,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.BAD_REQUEST,
        "appId required",
      );
    }

    const settings = await getApplicationSettings(appId);
    if (!settings) {
      return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
    }

    return c.json({ settings }, 200, {
      "Cache-Control": "public, max-age=300",
    });
  })

  .post(
    "/ws-token",
    requireWidgetAuth(),
    async (c) => {
      const widgetAuth = getWidgetAuth(c);
      if (!widgetAuth) {
        return jsonError(c, HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHORIZED);
      }

      const visitorId = c.req.header("X-Visitor-Id")?.trim();
      if (!visitorId) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.BAD_REQUEST,
          "X-Visitor-Id header required",
        );
      }

      const origin = c.req.header("Origin") ?? "";

      const token = signWsToken(
        {
          appId: widgetAuth.application.id,
          origin,
          visitorId,
        },
        env.WS_TOKEN_SECRET,
      );

      return c.json({ token });
    },
  )

  .use("/conversations/*", createVisitorRateLimitMiddleware(sharedVisitorRateLimiter))
  .use("/conversations", createVisitorRateLimitMiddleware(sharedVisitorRateLimiter))

  // POST /conversations — create a support conversation from widget
  .post(
    "/conversations",
    requireWidgetAuth(),
    zValidator("json", createWidgetConversationSchema),
    async (c) => {
      try {
        const widgetAuth = getWidgetAuth(c);
        if (!widgetAuth) {
          return jsonError(
            c,
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_MESSAGES.UNAUTHORIZED,
          );
        }

        const { subject } = c.req.valid("json");
        const visitorId = c.req.header("X-Visitor-Id");

        if (!visitorId) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.BAD_REQUEST,
            "X-Visitor-Id header required",
          );
        }

        await resolveOrCreateVisitor(visitorId);

        const conversation = await createConversation({
          organizationId: widgetAuth.organizationId,
          applicationId: widgetAuth.application.id,
          subject,
          createdBy: visitorId,
          participants: [{ userId: visitorId, role: "visitor" }],
        });

        // Broadcast to org staff so the queue updates in real-time
        const event: WSServerEvent = {
          type: "conversation:new",
          payload: {
            id: conversation.id,
            organizationId: widgetAuth.organizationId,
            applicationId: widgetAuth.application.id,
            status: "pending",
            subject: subject ?? null,
            createdAt: conversation.createdAt,
          },
        };
        roomManager.broadcastToOrganization(
          widgetAuth.organizationId,
          JSON.stringify(event),
        );

        return c.json({ conversation }, 201);
      } catch (error) {
        console.error("Error creating widget conversation:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // GET /conversations/:id/messages — paginated history for reconnection
  .get(
    "/conversations/:id/messages",
    requireWidgetAuth(),
    zValidator("query", getMessagesQuerySchema),
    async (c) => {
      try {
        const widgetAuth = getWidgetAuth(c);
        if (!widgetAuth) {
          return jsonError(
            c,
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_MESSAGES.UNAUTHORIZED,
          );
        }

        const conversationId = c.req.param("id");
        const { limit, offset } = c.req.valid("query");

        // Verify conversation belongs to this application's org
        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.applicationId, widgetAuth.application.id),
            ),
          )
          .limit(1);

        if (!conv) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found",
          );
        }

        const result = await db
          .select({
            id: messages.id,
            conversationId: messages.conversationId,
            senderId: messages.senderId,
            senderName: user.name,
            type: messages.type,
            content: messages.content,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .leftJoin(user, eq(messages.senderId, user.id))
          .where(
            and(
              eq(messages.conversationId, conversationId),
              isNull(messages.deletedAt),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(limit)
          .offset(offset);

        return c.json({ messages: result, limit, offset });
      } catch (error) {
        console.error("Error fetching widget messages:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // GET /conversations/:id/unread — unread count for visitor
  .get(
    "/conversations/:id/unread",
    requireWidgetAuth(),
    async (c) => {
      try {
        const widgetAuth = getWidgetAuth(c);
        if (!widgetAuth) {
          return jsonError(c, HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHORIZED);
        }

        const conversationId = c.req.param("id");
        const visitorId = c.req.header("X-Visitor-Id");
        if (!visitorId) {
          return jsonError(c, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.BAD_REQUEST, "X-Visitor-Id header required");
        }

        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.applicationId, widgetAuth.application.id),
            ),
          )
          .limit(1);

        if (!conv) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
        }

        const unreadCount = await getUnreadCountForVisitor(conversationId, visitorId);
        return c.json({ unreadCount });
      } catch (error) {
        console.error("Error fetching widget unread count:", error);
        return jsonError(c, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
      }
    },
  )

  // POST /conversations/:id/read — mark conversation as read for visitor
  .post(
    "/conversations/:id/read",
    requireWidgetAuth(),
    async (c) => {
      try {
        const widgetAuth = getWidgetAuth(c);
        if (!widgetAuth) {
          return jsonError(c, HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHORIZED);
        }

        const conversationId = c.req.param("id");
        const visitorId = c.req.header("X-Visitor-Id");
        if (!visitorId) {
          return jsonError(c, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.BAD_REQUEST, "X-Visitor-Id header required");
        }

        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.applicationId, widgetAuth.application.id),
            ),
          )
          .limit(1);

        if (!conv) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
        }

        const [latestMessage] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              isNull(messages.deletedAt),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(1);

        if (!latestMessage) {
          return c.json({ success: true });
        }

        await markAsRead(conversationId, visitorId, latestMessage.id);
        return c.json({ success: true });
      } catch (error) {
        console.error("Error marking widget conversation as read:", error);
        return jsonError(c, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
      }
    },
  );
