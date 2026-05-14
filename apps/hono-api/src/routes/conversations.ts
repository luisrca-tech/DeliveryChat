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
  createConversationBodySchema,
  sendMessageBodySchema,
  editMessageBodySchema,
  markAsReadBodySchema,
} from "./schemas/conversations.js";
import {
  createConversation,
  getConversationWithParticipants,
  sendMessage,
  editMessage,
  deleteMessage,
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
  getUnreadCountForVisitor,
  getUnreadCount,
} from "../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../features/chat/error-mapper.js";
import {
  broadcastRoomEvent,
  buildMessageEditedEvent,
  buildMessageDeletedEvent,
} from "../features/chat/broadcasting.service.js";
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

  // ── Dual-auth write endpoints ──

  .post(
    "/",
    requireAuth(),
    zValidator("json", createConversationBodySchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        const { subject } = c.req.valid("json");

        if (auth.type === "visitor") {
          const conversation = await createConversation({
            organizationId: auth.application.organizationId,
            applicationId: auth.application.id,
            subject,
            createdBy: auth.visitorUserId,
            participants: [{ userId: auth.visitorUserId, role: "visitor" }],
          });

          const withParticipants = await getConversationWithParticipants(
            conversation.id,
            auth.application.organizationId,
          );

          return c.json({ conversation: withParticipants }, 201);
        }

        const { organization, user: authUser } = auth;
        const conversation = await createConversation({
          organizationId: organization.id,
          subject,
          createdBy: authUser.id,
          participants: [{ userId: authUser.id, role: auth.membership.role === "admin" || auth.membership.role === "super_admin" ? "admin" : "operator" }],
        });

        const withParticipants = await getConversationWithParticipants(
          conversation.id,
          organization.id,
        );

        return c.json({ conversation: withParticipants }, 201);
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .post(
    "/:id/messages",
    requireAuth(),
    zValidator("json", sendMessageBodySchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        const conversationId = c.req.param("id");
        const { content } = c.req.valid("json");

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(conversationId, auth.visitorUserId);
          if (!participantCheck) {
            return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
          }

          const message = await sendMessage({
            conversationId,
            senderId: auth.visitorUserId,
            content,
            broadcastContext: { senderName: "Visitor", senderRole: "visitor" },
          });

          return c.json({ message }, 201);
        }

        const { organization, user: authUser, membership } = auth;
        const participantCheck = await isParticipant(conversationId, authUser.id);
        if (!participantCheck) {
          const conv = await getConversationWithParticipants(conversationId, organization.id);
          if (!conv) {
            return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
          }
        }

        const senderRole = membership.role === "admin" || membership.role === "super_admin" ? "admin" : "operator";
        const message = await sendMessage({
          conversationId,
          senderId: authUser.id,
          content,
          broadcastContext: { senderName: authUser.name, senderRole },
        });

        return c.json({ message }, 201);
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .patch(
    "/:id/messages/:messageId",
    requireAuth(),
    zValidator("json", editMessageBodySchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        const conversationId = c.req.param("id");
        const messageId = c.req.param("messageId");
        const { content } = c.req.valid("json");
        const senderId = auth.type === "visitor" ? auth.visitorUserId : auth.user.id;

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(conversationId, senderId);
          if (!participantCheck) {
            return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
          }
        }

        const message = await editMessage({ messageId, conversationId, senderId, content });

        broadcastRoomEvent(
          conversationId,
          buildMessageEditedEvent({
            conversationId,
            messageId,
            content,
            editedAt: message.editedAt!,
            senderId,
          }),
        );

        return c.json({ message });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .delete(
    "/:id/messages/:messageId",
    requireAuth(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        const conversationId = c.req.param("id");
        const messageId = c.req.param("messageId");
        const senderId = auth.type === "visitor" ? auth.visitorUserId : auth.user.id;

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(conversationId, senderId);
          if (!participantCheck) {
            return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
          }
        }

        await deleteMessage({ messageId, conversationId, senderId });

        broadcastRoomEvent(
          conversationId,
          buildMessageDeletedEvent({ conversationId, messageId, senderId }),
        );

        return c.json({ success: true });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
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
    requireAuth(),
    zValidator("json", markAsReadBodySchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        const conversationId = c.req.param("id");
        const { messageId } = c.req.valid("json");
        const userId = auth.type === "visitor" ? auth.visitorUserId : auth.user.id;

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(conversationId, userId);
          if (!participantCheck) {
            return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
          }
        }

        await markAsRead(conversationId, userId, messageId);
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

  .get(
    "/:id/unread",
    requireAuth(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        const conversationId = c.req.param("id");

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(conversationId, auth.visitorUserId);
          if (!participantCheck) {
            return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
          }
          const unreadCount = await getUnreadCountForVisitor(conversationId, auth.visitorUserId);
          return c.json({ unreadCount });
        }

        const userId = auth.user.id;
        const participantCheck = await isParticipant(conversationId, userId);
        if (!participantCheck) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND, "Conversation not found");
        }
        const unreadCount = await getUnreadCount(conversationId, userId);
        return c.json({ unreadCount });
      } catch (error) {
        console.error("Error getting unread count:", error);
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
