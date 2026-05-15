import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  listConversationsQuerySchema,
  getMessagesQuerySchema,
} from "./schemas.js";
import {
  getConversationWithParticipants,
  isParticipant,
  listConversationsForVisitor,
  listConversationsForMember,
  getMessageHistory,
  getMessageHistoryForMember,
} from "../../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../../features/chat/error-mapper.js";
import {
  requireAuth,
  getUnifiedAuth,
} from "../../lib/middleware/unifiedAuth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";

export const queriesRoute = new Hono()

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

        const result = await listConversationsForMember({
          organizationId: organization.id,
          userId: authUser.id,
          isAdmin,
          limit,
          offset,
          status,
          applicationId,
          assignedTo,
        });

        return c.json({
          conversations: result.conversations,
          total: result.total,
          limit,
          offset,
        });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
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
        return c.json({ conversation: result });
      }

      const { organization } = auth;
      const result = await getConversationWithParticipants(
        conversationId,
        organization.id,
      );

      return c.json({ conversation: result });
    } catch (error) {
      const mapped = mapServiceErrorToResponse(c, error);
      if (mapped) return mapped;
      throw error;
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

        const result = await getMessageHistoryForMember({
          conversationId,
          organizationId: organization.id,
          limit,
          offset,
        });
        return c.json({ messages: result, limit, offset });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  );
