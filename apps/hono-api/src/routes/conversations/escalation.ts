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
 * Core "talk to a human" semantics, shared by the unified-auth endpoint below
 * and the widget-auth variant in `routes/widget.ts`:
 * - closed conversation        → `closed` (callers respond 409).
 * - already human-handled      → `noop` — idempotent success, no duplicate
 *   escalation (the visitor is already with, or queued for, a human).
 * - AI-handled, open           → run the SAME escalation path the AI uses
 *   (`escalateConversation`, kind `human_requested`): system message +
 *   `conversation:escalated` broadcast + `handledBy` flip, all identical.
 *
 * Throws `ConversationNotFoundError` if the conversation doesn't exist or
 * belongs to another org.
 */
export async function escalateIfAiHandled(
  conversationId: string,
  organizationId: string,
): Promise<{
  outcome: "closed" | "noop" | "escalated";
  conversation: ConversationRow;
}> {
  const conv = await getConversationWithParticipants(
    conversationId,
    organizationId,
  );

  if (conv.status === "closed") {
    return { outcome: "closed", conversation: conv };
  }

  if (conv.handledBy !== "ai") {
    return { outcome: "noop", conversation: conv };
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
  return { outcome: "escalated", conversation: refreshed };
}

/**
 * "Talk to a human" escalation for unified-auth clients (staff sessions and
 * API-key visitors) — the deterministic escalation trigger (plan §6/§8, AC #4).
 * Mirrors the visitor auth of the messaging routes: `requireAuth()` + a
 * participant check for visitors. Browser-widget visitors use the
 * widget-authenticated variant in `routes/widget.ts` instead.
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

      const result = await escalateIfAiHandled(conversationId, organizationId);

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
      throw error;
    }
  },
);
