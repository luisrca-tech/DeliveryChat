import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, or, isNull, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations } from "../db/schema/conversations.js";
import { messages } from "../db/schema/messages.js";
import { conversationParticipants } from "../db/schema/conversationParticipants.js";
import { user } from "../db/schema/users.js";
import {
  listConversationsQuerySchema,
  getMessagesQuerySchema,
} from "./schemas/conversations.js";
import {
  getConversationWithParticipants,
  acceptConversation,
  leaveConversation,
  resolveConversation,
  addParticipant,
} from "../features/chat/chat.service.js";
import {
  getTenantAuth,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { createTenantRateLimitMiddleware } from "../lib/middleware/rateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import { roomManager } from "./ws.js";
import type { WSServerEvent } from "@repo/types";

export const conversationsRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .use("*", createTenantRateLimitMiddleware())

  // GET / — list conversations with visibility rules
  .get("/", zValidator("query", listConversationsQuerySchema), async (c) => {
    try {
      const { organization, user: authUser, membership } = getTenantAuth(c);
      const { limit, offset, status, type, applicationId, assignedTo } =
        c.req.valid("query");

      const isAdmin =
        membership.role === "admin" || membership.role === "super_admin";

      const conditions = [eq(conversations.organizationId, organization.id)];
      if (status) conditions.push(eq(conversations.status, status));
      if (type) conditions.push(eq(conversations.type, type));
      if (applicationId)
        conditions.push(eq(conversations.applicationId, applicationId));

      // assignedTo=me: filter to conversations assigned to the current user
      if (assignedTo === "me") {
        conditions.push(eq(conversations.assignedTo, authUser.id));
      }

      // Visibility rules:
      // - Admins/super_admins see all conversations
      // - Operators see: pending (queue) + active assigned to them
      if (!isAdmin) {
        conditions.push(
          or(
            eq(conversations.status, "pending"),
            eq(conversations.assignedTo, authUser.id),
          )!,
        );
      }

      const result = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(...conditions));

      return c.json({
        conversations: result,
        total: countRow?.count ?? 0,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Error listing conversations:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // GET /:id — get conversation with participants
  .get("/:id", async (c) => {
    try {
      const { organization } = getTenantAuth(c);
      const conversationId = c.req.param("id");

      const result = await getConversationWithParticipants(
        conversationId,
        organization.id,
      );

      if (!result) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found",
        );
      }

      return c.json({ conversation: result });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // GET /:id/messages — paginated message history
  .get(
    "/:id/messages",
    zValidator("query", getMessagesQuerySchema),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);
        const conversationId = c.req.param("id");
        const { limit, offset } = c.req.valid("query");

        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.organizationId, organization.id),
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
            senderRole: conversationParticipants.role,
            type: messages.type,
            content: messages.content,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .leftJoin(user, eq(messages.senderId, user.id))
          .leftJoin(
            conversationParticipants,
            and(
              eq(conversationParticipants.conversationId, messages.conversationId),
              eq(conversationParticipants.userId, messages.senderId),
            ),
          )
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
        console.error("Error fetching messages:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // POST /:id/accept — operator accepts a pending conversation (race-condition safe)
  .post("/:id/accept", async (c) => {
    try {
      const { organization, user: authUser } = getTenantAuth(c);
      const conversationId = c.req.param("id");

      const updated = await acceptConversation(
        conversationId,
        organization.id,
        authUser.id,
      );

      if (!updated) {
        return jsonError(
          c,
          HTTP_STATUS.CONFLICT,
          ERROR_MESSAGES.CONFLICT,
          "Conversation is no longer available",
        );
      }

      // Add operator as participant
      try {
        await addParticipant({
          conversationId,
          userId: authUser.id,
          role: "operator",
        });
      } catch {
        // Already a participant — ignore
      }

      // Broadcast to all org staff via WS
      const event: WSServerEvent = {
        type: "conversation:accepted",
        payload: {
          conversationId,
          assignedTo: authUser.id,
          assignedToName: "",
        },
      };
      roomManager.broadcastToOrganization(
        organization.id,
        JSON.stringify(event),
      );

      return c.json({ conversation: updated });
    } catch (error) {
      console.error("Error accepting conversation:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // POST /:id/leave — operator leaves a conversation (back to queue)
  .post("/:id/leave", async (c) => {
    try {
      const { organization, user: authUser } = getTenantAuth(c);
      const conversationId = c.req.param("id");

      const updated = await leaveConversation(
        conversationId,
        organization.id,
        authUser.id,
      );

      if (!updated) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found or not assigned to you",
        );
      }

      // Broadcast to all org staff via WS
      const event: WSServerEvent = {
        type: "conversation:released",
        payload: { conversationId },
      };
      roomManager.broadcastToOrganization(
        organization.id,
        JSON.stringify(event),
      );

      return c.json({ conversation: updated });
    } catch (error) {
      console.error("Error leaving conversation:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // POST /:id/resolve — mark conversation as solved
  .post("/:id/resolve", async (c) => {
    try {
      const { organization, user: authUser } = getTenantAuth(c);
      const conversationId = c.req.param("id");

      const updated = await resolveConversation(
        conversationId,
        organization.id,
        authUser.id,
      );

      if (!updated) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found or not assigned to you",
        );
      }

      // Broadcast to all org staff via WS
      const event: WSServerEvent = {
        type: "conversation:resolved",
        payload: {
          conversationId,
          resolvedBy: authUser.id,
        },
      };
      roomManager.broadcastToOrganization(
        organization.id,
        JSON.stringify(event),
      );

      return c.json({ conversation: updated });
    } catch (error) {
      console.error("Error resolving conversation:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  });
