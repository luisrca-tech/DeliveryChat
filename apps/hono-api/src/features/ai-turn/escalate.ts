import { eq, sql } from "drizzle-orm";
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
 *    escalatedAt=now, escalationReason=reason (truncated to 500).
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
    .where(eq(conversations.id, conversation.id))
    .returning({
      escalatedAt: conversations.escalatedAt,
      escalationReason: conversations.escalationReason,
    });

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
          updated?.escalationReason ?? truncateEscalationReason(reason),
        escalatedAt: updated?.escalatedAt ?? new Date().toISOString(),
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
}
