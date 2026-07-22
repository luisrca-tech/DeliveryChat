import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";
import {
  broadcastRoomEvent,
  broadcastStaffEvent,
  buildMessageNewEvent,
  buildConversationEscalatedEvent,
} from "../chat/broadcasting.service.js";
import type { TurnConversation } from "./loadContext.js";
import {
  escalationMessageFor,
  truncateEscalationReason,
  type EscalationKind,
} from "./messages.js";

/**
 * Flip an AI-handled conversation to human handling and notify everyone.
 *
 * 1. `conversations` → handledBy=human, status=pending, assignedTo=null,
 *    escalatedAt=now, escalationReason=reason (truncated to 500). The UPDATE is
 *    guarded (`handledBy = 'ai' AND status != 'closed'`) so a stale in-flight
 *    turn can never kick out an operator who accepted mid-call or reopen a
 *    closed conversation — losing that race makes the whole call a no-op,
 *    which also makes escalation idempotent for every caller.
 * 2. Persist a visitor-facing system message (type=system, authorType=system).
 * 3. Broadcast that system message to the conversation room.
 * 4. Broadcast `conversation:escalated` to staff so the operator queue updates.
 *
 * Broadcast failures are logged, never thrown — the DB flip is the source of
 * truth and must not be undone by a transport hiccup.
 */
export async function escalateConversation(input: {
  conversation: TurnConversation;
  reason: string;
  kind: EscalationKind;
}): Promise<void> {
  const { conversation, reason, kind } = input;
  const content = escalationMessageFor(kind);

  const [updated] = await db
    .update(conversations)
    .set({
      handledBy: "human",
      status: "pending",
      assignedTo: null,
      escalatedAt: sql`now()`,
      escalationReason: truncateEscalationReason(reason),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversations.id, conversation.id),
        eq(conversations.handledBy, "ai"),
        ne(conversations.status, "closed"),
      ),
    )
    .returning({
      escalatedAt: conversations.escalatedAt,
      escalationReason: conversations.escalationReason,
    });

  if (!updated) {
    // Lost the race: an operator already took over, or the conversation was
    // closed/escalated meanwhile. Nothing to announce — the visitor is already
    // in (or queued for) human hands.
    console.debug(
      "[ai-turn] escalation skipped: conversation no longer AI-handled or closed",
      conversation.id,
    );
    return;
  }

  const [systemMessage] = await db
    .insert(messages)
    .values({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      senderId: null,
      type: "system",
      authorType: "system",
      content,
    })
    .returning();

  if (systemMessage) {
    try {
      broadcastRoomEvent(
        conversation.id,
        buildMessageNewEvent({
          id: systemMessage.id,
          conversationId: conversation.id,
          senderId: null,
          senderName: "",
          senderRole: "operator",
          content: systemMessage.content,
          contentFormat: "plain",
          contentHtml: null,
          type: "system",
          authorType: "system",
          createdAt: systemMessage.createdAt,
        }),
      );
    } catch (err) {
      console.error(
        "[ai-turn] escalation system-message broadcast failed",
        conversation.id,
        err,
      );
    }
  }

  try {
    broadcastStaffEvent(
      conversation.organizationId,
      buildConversationEscalatedEvent({
        conversationId: conversation.id,
        organizationId: conversation.organizationId,
        applicationId: conversation.applicationId,
        status: "pending",
        subject: conversation.subject,
        escalationReason:
          updated.escalationReason ?? truncateEscalationReason(reason),
        escalatedAt: updated.escalatedAt ?? new Date().toISOString(),
        createdAt: conversation.createdAt,
      }),
    );
  } catch (err) {
    console.error(
      "[ai-turn] conversation:escalated broadcast failed",
      conversation.id,
      err,
    );
  }

  // ── Fire-and-forget operator handoff summary ──
  // Generated for EVERY escalation (AI-initiated or visitor-requested) so the
  // operator gets context on takeover. Lazily imported to keep this module's
  // static graph light, and never awaited — the DB flip above is the source of
  // truth and must not depend on the summary. `generateHandoffSummary` owns all
  // its own error handling and never throws.
  void (async () => {
    try {
      const { generateHandoffSummary } = await import("./handoffSummary.js");
      await generateHandoffSummary(conversation);
    } catch (err) {
      console.error(
        "[ai-turn] handoff summary kickoff failed",
        conversation.id,
        err,
      );
    }
  })();
}
