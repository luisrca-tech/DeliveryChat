import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { markAsReadBodySchema } from "./schemas.js";
import {
  markAsRead,
  isParticipant,
  getUnreadCountForVisitor,
  getUnreadCount,
} from "../../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../../features/chat/error-mapper.js";
import {
  requireAuth,
  getUnifiedAuth,
} from "../../lib/middleware/unifiedAuth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";

export const readReceiptsRoute = new Hono()

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
  });
