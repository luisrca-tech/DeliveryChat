import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  updateConversationSubjectSchema,
  markAsReadBodySchema,
} from "./schemas.js";
import {
  acceptConversation,
  leaveConversation,
  resolveConversation,
  softDeleteConversation,
  updateConversationSubject,
  addParticipant,
  markAsRead,
  isParticipant,
  getUnreadCountForVisitor,
  getUnreadCount,
} from "../../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../../features/chat/error-mapper.js";
import {
  requireAuth,
  requireMember,
  getUnifiedAuth,
} from "../../lib/middleware/unifiedAuth.js";
import { checkBillingStatus } from "../../lib/middleware/billing.js";
import { createUnifiedRateLimitMiddleware } from "../../lib/middleware/unifiedRateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import { queriesRoute } from "./queries.js";
import { messagingRoute } from "./messaging.js";

const lifecycleRoute = new Hono()

  .post(
    "/:id/accept",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");

        const updated = await acceptConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
        );

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
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .post(
    "/:id/leave",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");

        const updated = await leaveConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
        );

        return c.json({ conversation: updated });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .post(
    "/:id/resolve",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");

        const updated = await resolveConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
        );

        return c.json({ conversation: updated });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .patch(
    "/:id/subject",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    zValidator("json", updateConversationSubjectSchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");
        const { subject } = c.req.valid("json");

        const updated = await updateConversationSubject(
          conversationId,
          organization.id,
          authUser.id,
          subject,
        );

        return c.json({ conversation: updated });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
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
        const userId =
          auth.type === "visitor" ? auth.visitorUserId : auth.user.id;

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(conversationId, userId);
          if (!participantCheck) {
            return jsonError(
              c,
              HTTP_STATUS.NOT_FOUND,
              ERROR_MESSAGES.NOT_FOUND,
              "Conversation not found",
            );
          }
        }

        await markAsRead(conversationId, userId, messageId);
        return c.json({ success: true });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .get("/:id/unread", requireAuth(), async (c) => {
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
        const unreadCount = await getUnreadCountForVisitor(
          conversationId,
          auth.visitorUserId,
        );
        return c.json({ unreadCount });
      }

      const userId = auth.user.id;
      const participantCheck = await isParticipant(conversationId, userId);
      if (!participantCheck) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found",
        );
      }
      const unreadCount = await getUnreadCount(conversationId, userId);
      return c.json({ unreadCount });
    } catch (error) {
      const mapped = mapServiceErrorToResponse(c, error);
      if (mapped) return mapped;
      throw error;
    }
  })

  .delete(
    "/:id",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");

        const isAdmin =
          auth.membership.role === "admin" ||
          auth.membership.role === "super_admin";
        if (!isAdmin) {
          return jsonError(
            c,
            HTTP_STATUS.FORBIDDEN,
            ERROR_MESSAGES.FORBIDDEN,
            "Insufficient role",
          );
        }

        const { organization } = auth;
        const conversationId = c.req.param("id");

        await softDeleteConversation(conversationId, organization.id);

        return c.body(null, 204);
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  );

export const conversationsRoute = new Hono()
  .use("*", createUnifiedRateLimitMiddleware())
  .route("/", queriesRoute)
  .route("/", messagingRoute)
  .route("/", lifecycleRoute);
