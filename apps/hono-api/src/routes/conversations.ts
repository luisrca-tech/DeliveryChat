import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, or, inArray, isNull, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations } from "../db/schema/conversations.js";
import { messages } from "../db/schema/messages.js";
import { conversationParticipants } from "../db/schema/conversationParticipants.js";
import { user } from "../db/schema/users.js";
import {
  listConversationsQuerySchema,
  getMessagesQuerySchema,
  updateConversationSubjectSchema,
} from "./schemas/conversations.js";
import {
  getConversationWithParticipants,
  acceptConversation,
  leaveConversation,
  resolveConversation,
  softDeleteConversation,
  updateConversationSubject,
  addParticipant,
  getBulkUnreadCounts,
  markAsRead,
} from "../features/chat/chat.service.js";
import {
  getTenantAuth,
  requireTenantAuth,
  requireRole,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { createTenantRateLimitMiddleware } from "../lib/middleware/rateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import {
  buildConversationAcceptedEvent,
  buildConversationReleasedEvent,
  buildConversationResolvedEvent,
  broadcastOrganizationEvent,
} from "../features/chat/broadcasting.service.js";

export const conversationsRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .use("*", createTenantRateLimitMiddleware())

  // GET / — list conversations with visibility rules
  .get("/", zValidator("query", listConversationsQuerySchema), async (c) => {
    try {
      const { organization, user: authUser, membership } = getTenantAuth(c);
      const { limit, offset, status, applicationId, assignedTo } =
        c.req.valid("query");

      const isAdmin =
        membership.role === "admin" || membership.role === "super_admin";

      const conditions = [
        eq(conversations.organizationId, organization.id),
        isNull(conversations.deletedAt),
      ];
      if (status) conditions.push(inArray(conversations.status, status));
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

      const assignedIds = result
        .filter((conv) => conv.assignedTo === authUser.id)
        .map((conv) => conv.id);

      const unreadCounts =
        assignedIds.length > 0
          ? await getBulkUnreadCounts(assignedIds, authUser.id)
          : new Map<string, number>();

      const conversationsWithUnread = result.map((conv) => ({
        ...conv,
        unreadCount: unreadCounts.get(conv.id) ?? 0,
      }));

      return c.json({
        conversations: conversationsWithUnread,
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

      broadcastOrganizationEvent(
        organization.id,
        buildConversationAcceptedEvent({
          conversationId,
          assignedTo: authUser.id,
          assignedToName: "",
        }),
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

      broadcastOrganizationEvent(
        organization.id,
        buildConversationReleasedEvent({ conversationId }),
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

      broadcastOrganizationEvent(
        organization.id,
        buildConversationResolvedEvent({
          conversationId,
          resolvedBy: authUser.id,
        }),
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
  })

  // PATCH /:id/subject — update subject (assigned user only)
  .patch(
    "/:id/subject",
    zValidator("json", updateConversationSubjectSchema),
    async (c) => {
      try {
        const { organization, user: authUser } = getTenantAuth(c);
        const conversationId = c.req.param("id");
        const { subject } = c.req.valid("json");

        const updated = await updateConversationSubject(
          conversationId,
          organization.id,
          authUser.id,
          subject,
        );

        if (!updated) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found or not assigned to you",
          );
        }

        return c.json({ conversation: updated });
      } catch (error) {
        console.error("Error updating conversation subject:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // POST /:id/read — mark conversation as read for current user
  .post("/:id/read", async (c) => {
    try {
      const { user: authUser } = getTenantAuth(c);
      const conversationId = c.req.param("id");

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

      await markAsRead(conversationId, authUser.id, latestMessage.id);
      return c.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // DELETE /:id — soft delete conversation (admin/super_admin only)
  .delete("/:id", requireRole("admin"), async (c) => {
    try {
      const { organization } = getTenantAuth(c);
      const conversationId = c.req.param("id");

      const deleted = await softDeleteConversation(
        conversationId,
        organization.id,
      );

      if (!deleted) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found",
        );
      }

      return c.body(null, 204);
    } catch (error) {
      console.error("Error deleting conversation:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  });
