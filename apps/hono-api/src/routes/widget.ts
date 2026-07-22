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
import { resolveInitialHandledBy } from "../features/ai-turn/resolveInitialHandledBy.js";
import {
  createConversation,
  listConversationsForVisitor,
  getUnreadCountForVisitor,
  markAsRead,
  isParticipant,
} from "../features/chat/chat.service.js";
import { escalateIfAiHandled } from "./conversations/escalation.js";
import { mapServiceErrorToResponse } from "../features/chat/error-mapper.js";
import { resolveOrCreateVisitor } from "../features/chat/visitor.service.js";
import {
  requireWidgetAuth,
  getWidgetAuth,
} from "../lib/middleware/widgetAuth.js";
import { createVisitorRateLimitMiddleware } from "../lib/middleware/visitorRateLimit.js";
import { sharedVisitorRateLimiter } from "../lib/middleware/visitorRateLimitInstance.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import {
  createConversationBodySchema,
  getMessagesQuerySchema,
  listConversationsQuerySchema,
} from "./schemas/conversationSchemas.js";
import { identifyRoute } from "../features/identity/identify.route.js";

export const widgetRoute = new Hono()
  .route("/", identifyRoute)
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

    // Bot-disclosure entitlement (plan §8 — legally required, not polish).
    // Reuses the same org+application entitlement check the AI turn trigger
    // uses, so the widget's disclosure line can never drift from whether the
    // conversation would actually be AI-handled.
    const handledBy = await resolveInitialHandledBy(appId);
    const existingAi = (settings as { ai?: Record<string, unknown> }).ai;
    const settingsWithAi = {
      ...settings,
      ai: {
        ...existingAi,
        enabled: handledBy === "ai",
      },
    };

    // The payload is cheap to serve but now carries the AI-disclosure
    // entitlement (ai.enabled), so staleness must be bounded tightly: 60s
    // keeps widget-boot caching while making AI on/off toggles propagate
    // within a minute.
    return c.json({ settings: settingsWithAi }, 200, {
      "Cache-Control": "public, max-age=60",
    });
  })

  .post("/ws-token", requireWidgetAuth(), async (c) => {
    const widgetAuth = getWidgetAuth(c);
    if (!widgetAuth) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
      );
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
  })

  .use(
    "/conversations/*",
    createVisitorRateLimitMiddleware(sharedVisitorRateLimiter),
  )
  .use(
    "/conversations",
    createVisitorRateLimitMiddleware(sharedVisitorRateLimiter),
  )

  // GET /conversations — list visitor's conversations
  .get(
    "/conversations",
    requireWidgetAuth(),
    zValidator("query", listConversationsQuerySchema),
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

        const visitorId = c.req.header("X-Visitor-Id");
        if (!visitorId) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.BAD_REQUEST,
            "X-Visitor-Id header required",
          );
        }

        const { limit, offset } = c.req.valid("query");

        const result = await listConversationsForVisitor({
          applicationId: widgetAuth.application.id,
          organizationId: widgetAuth.organizationId,
          visitorUserId: visitorId,
          limit,
          offset,
        });

        return c.json({
          conversations: result.conversations,
          visitorUserId: visitorId,
          total: result.total,
          limit,
          offset,
        });
      } catch (error) {
        console.error("Error listing widget conversations:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // POST /conversations — create a support conversation from widget
  .post(
    "/conversations",
    requireWidgetAuth(),
    zValidator("json", createConversationBodySchema),
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

        // Same AI-vs-human decision the unified `/conversations` route makes.
        // Without it the widget — the only path real visitors use — would
        // always create human-handled conversations and the AI would never run.
        const handledBy = await resolveInitialHandledBy(
          widgetAuth.application.id,
        );

        const conversation = await createConversation({
          organizationId: widgetAuth.organizationId,
          applicationId: widgetAuth.application.id,
          subject,
          createdBy: visitorId,
          handledBy,
          participants: [{ userId: visitorId, role: "visitor" }],
        });

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

  // POST /conversations/:id/escalate — visitor "Talk to a human" trigger.
  // Widget-auth variant of routes/conversations/escalation.ts (browser widgets
  // have no API key/session); shares the exact same escalation semantics.
  .post("/conversations/:id/escalate", requireWidgetAuth(), async (c) => {
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
      const visitorId = c.req.header("X-Visitor-Id");
      if (!visitorId) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.BAD_REQUEST,
          "X-Visitor-Id header required",
        );
      }

      // Verify conversation belongs to this application AND the visitor
      // participates in it — same not-found shape as the sibling endpoints.
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
      const participant =
        conv && (await isParticipant(conversationId, visitorId));
      if (!conv || !participant) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found",
        );
      }

      const result = await escalateIfAiHandled(
        conversationId,
        widgetAuth.organizationId,
      );

      if (result.outcome === "closed") {
        return jsonError(
          c,
          HTTP_STATUS.CONFLICT,
          ERROR_MESSAGES.CONFLICT,
          "Conversation is closed",
        );
      }

      return c.json({ conversation: result.conversation });
    } catch (error) {
      const mapped = mapServiceErrorToResponse(c, error);
      if (mapped) return mapped;
      console.error("Error escalating widget conversation:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // GET /conversations/:id/unread — unread count for visitor
  .get("/conversations/:id/unread", requireWidgetAuth(), async (c) => {
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
      const visitorId = c.req.header("X-Visitor-Id");
      if (!visitorId) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.BAD_REQUEST,
          "X-Visitor-Id header required",
        );
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
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found",
        );
      }

      const unreadCount = await getUnreadCountForVisitor(
        conversationId,
        visitorId,
      );
      return c.json({ unreadCount });
    } catch (error) {
      console.error("Error fetching widget unread count:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // POST /conversations/:id/read — mark conversation as read for visitor
  .post("/conversations/:id/read", requireWidgetAuth(), async (c) => {
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
      const visitorId = c.req.header("X-Visitor-Id");
      if (!visitorId) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.BAD_REQUEST,
          "X-Visitor-Id header required",
        );
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
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found",
        );
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
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  });
