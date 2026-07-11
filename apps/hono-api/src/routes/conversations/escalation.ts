import { Hono } from "hono";
import {
  getConversationWithParticipants,
  isParticipant,
} from "../../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../../features/chat/error-mapper.js";
import { escalateConversation } from "../../features/ai-turn/escalate.js";
import type { TurnConversation } from "../../features/ai-turn/loadContext.js";
import {
  requireAuth,
  getUnifiedAuth,
} from "../../lib/middleware/unifiedAuth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";

type ConversationRow = Awaited<
  ReturnType<typeof getConversationWithParticipants>
>;

/** Project the full conversation row onto the shape `escalateConversation` needs. */
function toTurnConversation(conv: ConversationRow): TurnConversation {
  return {
    id: conv.id,
    organizationId: conv.organizationId,
    applicationId: conv.applicationId as string,
    status: conv.status,
    handledBy: conv.handledBy,
    assignedTo: conv.assignedTo,
    createdBy: conv.createdBy,
    subject: conv.subject,
    createdAt: conv.createdAt,
  };
}

/**
 * Visitor-facing "Talk to a human" escalation — the deterministic escalation
 * trigger (plan §6/§8, AC #4). Mirrors the visitor auth of the messaging routes:
 * `requireAuth()` + a participant check for visitors.
 *
 * Semantics:
 * - closed conversation                → 409 (nothing to escalate).
 * - AI-handled, open                    → run the SAME escalation path the AI
 *   uses (`escalateConversation`, kind `human_requested`): system message +
 *   `conversation:escalated` broadcast + `handledBy` flip, all identical.
 * - already human-handled, open         → idempotent no-op success (the visitor
 *   is already with, or queued for, a human).
 *
 * Responds with the updated conversation snapshot, like sibling lifecycle
 * endpoints.
 */
export const escalationRoute = new Hono().post(
  "/:id/escalate",
  requireAuth(),
  async (c) => {
    try {
      const auth = getUnifiedAuth(c);
      const conversationId = c.req.param("id");

      let organizationId: string;
      if (auth.type === "visitor") {
        const participant = await isParticipant(
          conversationId,
          auth.visitorUserId,
        );
        if (!participant) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found",
          );
        }
        organizationId = auth.application.organizationId;
      } else {
        organizationId = auth.organization.id;
      }

      // Throws ConversationNotFoundError if it doesn't exist / wrong org.
      const conv = await getConversationWithParticipants(
        conversationId,
        organizationId,
      );

      if (conv.status === "closed") {
        return jsonError(
          c,
          HTTP_STATUS.CONFLICT,
          ERROR_MESSAGES.CONFLICT,
          "Conversation is closed",
        );
      }

      // Already human-handled → idempotent success, no duplicate escalation.
      if (conv.handledBy !== "ai") {
        return c.json({ conversation: conv });
      }

      await escalateConversation({
        conversation: toTurnConversation(conv),
        reason: "human_requested",
        kind: "human_requested",
      });

      const refreshed = await getConversationWithParticipants(
        conversationId,
        organizationId,
      );
      return c.json({ conversation: refreshed });
    } catch (error) {
      const mapped = mapServiceErrorToResponse(c, error);
      if (mapped) return mapped;
      throw error;
    }
  },
);
