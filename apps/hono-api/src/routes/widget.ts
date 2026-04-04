import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages } from "../db/schema/messages.js";
import { user } from "../db/schema/users.js";
import { conversations } from "../db/schema/conversations.js";
import { applications } from "../db/schema/applications.js";
import { getApplicationSettings } from "../features/applications/application.service.js";
import {
  createConversation,
  ApplicationRequiredError,
} from "../features/chat/chat.service.js";
import { requireApiKeyAuth, getApiAuth } from "../lib/middleware/apiKeyAuth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import {
  createWidgetConversationSchema,
  getMessagesQuerySchema,
} from "./schemas/conversations.js";

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

  // POST /conversations — create a support conversation from widget
  .post(
    "/conversations",
    requireApiKeyAuth(),
    zValidator("json", createWidgetConversationSchema),
    async (c) => {
      try {
        const apiAuth = getApiAuth(c);
        if (!apiAuth) {
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

        // Look up organizationId from the application
        const [app] = await db
          .select({ organizationId: applications.organizationId })
          .from(applications)
          .where(eq(applications.id, apiAuth.application.id))
          .limit(1);

        if (!app) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Application not found",
          );
        }

        const conversation = await createConversation({
          organizationId: app.organizationId,
          applicationId: apiAuth.application.id,
          type: "support",
          subject,
          participants: [{ userId: visitorId, role: "visitor" }],
        });

        return c.json({ conversation }, 201);
      } catch (error) {
        if (error instanceof ApplicationRequiredError) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.BAD_REQUEST,
            error.message,
          );
        }
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
    requireApiKeyAuth(),
    zValidator("query", getMessagesQuerySchema),
    async (c) => {
      try {
        const apiAuth = getApiAuth(c);
        if (!apiAuth) {
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
              eq(conversations.applicationId, apiAuth.application.id),
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
  );
