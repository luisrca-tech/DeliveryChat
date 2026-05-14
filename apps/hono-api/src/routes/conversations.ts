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
  isParticipant,
  listConversationsForVisitor,
  getMessageHistory,
} from "../features/chat/chat.service.js";
import {
  requireAuth,
  getUnifiedAuth,
} from "../lib/middleware/unifiedAuth.js";
import {
  getTenantAuth,
  requireTenantAuth,
  requireRole,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { createTenantRateLimitMiddleware } from "../lib/middleware/rateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const conversationsRoute = new Hono()

  // ── Dual-auth read endpoints ──

  .get(
    "/",
    requireAuth(),
    zValidator("query", listConversationsQuerySchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);

        if (auth.type === "visitor") {
          const { limit, offset } = c.req.valid("query");
          const result = await listConversationsForVisitor({
            applicationId: auth.application.id,
            organizationId: auth.application.organizationId,
            visitorUserId: auth.visitorUserId,
            limit,
            offset,
          });
          return c.json({
            conversations: result.conversations,
            total: result.total,
            limit,
            offset,
          });
        }

        const { organization, user: authUser, membership } = auth;
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

        if (assignedTo === "me") {
          conditions.push(eq(conversations.assignedTo, authUser.id));
        }

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
    },
  )

  .get("/:id", requireAuth(), async (c) => {
    try {
      const auth = getUnifiedAuth(c);
      const conversationId = c.req.param("id");

      if (auth.type === "visitor") {
        const participantCheck = await isParticipant(
          conversationId,
          auth.visitorUserId,
        );
        if (!participantCheck) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found",
          );
        }

        const result = await getConversationWithParticipants(
          conversationId,
          auth.application.organizationId,
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
      }

      const { organization } = auth;
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

  .get(
    "/:id/messages",
    requireAuth(),
    zValidator("query", getMessagesQuerySchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        const conversationId = c.req.param("id");
        const { limit, offset } = c.req.valid("query");

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(
            conversationId,
            auth.visitorUserId,
          );
          if (!participantCheck) {
            return jsonError(
              c,
              HTTP_STATUS.NOT_FOUND,
              ERROR_MESSAGES.NOT_FOUND,
              "Conversation not found",
            );
          }

          const msgs = await getMessageHistory({
            conversationId,
            limit,
            offset,
          });
          return c.json({ messages: msgs, limit, offset });
        }

        const { organization } = auth;
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
              eq(
                conversationParticipants.conversationId,
                messages.conversationId,
              ),
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

  // ── Member-only endpoints (keep existing auth chain) ──

  .post(
    "/:id/accept",
    requireTenantAuth(),
    checkBillingStatus(),
    createTenantRateLimitMiddleware(),
    async (c) => {
      try {
        const { organization, user: authUser } = getTenantAuth(c);
        const conversationId = c.req.param("id");

        const updated = await acceptConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
        );

        if (!updated) {
          return jsonError(
            c,
            HTTP_STATUS.CONFLICT,
            ERROR_MESSAGES.CONFLICT,
            "Conversation is no longer available",
          );
        }

        try {
          await addParticipant({
            conversationId,
            userId: authUser.id,
            role: "operator",
          });
        } catch {
          // Already a participant — ignore
        }

        return c.json({ conversation: updated });
      } catch (error) {
        console.error("Error accepting conversation:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  .post(
    "/:id/leave",
    requireTenantAuth(),
    checkBillingStatus(),
    createTenantRateLimitMiddleware(),
    async (c) => {
      try {
        const { organization, user: authUser } = getTenantAuth(c);
        const conversationId = c.req.param("id");

        const updated = await leaveConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
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
        console.error("Error leaving conversation:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  .post(
    "/:id/resolve",
    requireTenantAuth(),
    checkBillingStatus(),
    createTenantRateLimitMiddleware(),
    async (c) => {
      try {
        const { organization, user: authUser } = getTenantAuth(c);
        const conversationId = c.req.param("id");

        const updated = await resolveConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
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
        console.error("Error resolving conversation:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  .patch(
    "/:id/subject",
    requireTenantAuth(),
    checkBillingStatus(),
    createTenantRateLimitMiddleware(),
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

  .post(
    "/:id/read",
    requireTenantAuth(),
    checkBillingStatus(),
    createTenantRateLimitMiddleware(),
    async (c) => {
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
    },
  )

  .delete(
    "/:id",
    requireTenantAuth(),
    requireRole("admin"),
    checkBillingStatus(),
    createTenantRateLimitMiddleware(),
    async (c) => {
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
    },
  );
