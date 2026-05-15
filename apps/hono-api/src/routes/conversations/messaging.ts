import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createConversationBodySchema,
  sendMessageBodySchema,
  editMessageBodySchema,
} from "./schemas.js";
import {
  createConversation,
  getConversationWithParticipants,
  sendMessage,
  editMessage,
  deleteMessage,
  isParticipant,
} from "../../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../../features/chat/error-mapper.js";
import {
  broadcastRoomEvent,
  buildMessageEditedEvent,
  buildMessageDeletedEvent,
} from "../../features/chat/broadcasting.service.js";
import {
  requireAuth,
  getUnifiedAuth,
} from "../../lib/middleware/unifiedAuth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";

export const messagingRoute = new Hono()

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
          participants: [
            {
              userId: authUser.id,
              role:
                auth.membership.role === "admin" ||
                auth.membership.role === "super_admin"
                  ? "admin"
                  : "operator",
            },
          ],
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

          const message = await sendMessage({
            conversationId,
            senderId: auth.visitorUserId,
            content,
            broadcastContext: {
              senderName: "Visitor",
              senderRole: "visitor",
            },
          });

          return c.json({ message }, 201);
        }

        const { organization, user: authUser, membership } = auth;
        const participantCheck = await isParticipant(
          conversationId,
          authUser.id,
        );
        if (!participantCheck) {
          const conv = await getConversationWithParticipants(
            conversationId,
            organization.id,
          );
          if (!conv) {
            return jsonError(
              c,
              HTTP_STATUS.NOT_FOUND,
              ERROR_MESSAGES.NOT_FOUND,
              "Conversation not found",
            );
          }
        }

        const senderRole =
          membership.role === "admin" || membership.role === "super_admin"
            ? "admin"
            : "operator";
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
        const senderId =
          auth.type === "visitor" ? auth.visitorUserId : auth.user.id;

        if (auth.type === "visitor") {
          const participantCheck = await isParticipant(
            conversationId,
            senderId,
          );
          if (!participantCheck) {
            return jsonError(
              c,
              HTTP_STATUS.NOT_FOUND,
              ERROR_MESSAGES.NOT_FOUND,
              "Conversation not found",
            );
          }
        }

        const message = await editMessage({
          messageId,
          conversationId,
          senderId,
          content,
        });

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

  .delete("/:id/messages/:messageId", requireAuth(), async (c) => {
    try {
      const auth = getUnifiedAuth(c);
      const conversationId = c.req.param("id");
      const messageId = c.req.param("messageId");
      const senderId =
        auth.type === "visitor" ? auth.visitorUserId : auth.user.id;

      if (auth.type === "visitor") {
        const participantCheck = await isParticipant(
          conversationId,
          senderId,
        );
        if (!participantCheck) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found",
          );
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
  });
