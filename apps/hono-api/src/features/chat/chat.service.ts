import { eq, ne, and, or, sql, isNull, desc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";
import { conversationParticipants } from "../../db/schema/conversationParticipants.js";
import { user } from "../../db/schema/users.js";
import type {
  ConversationStatus,
  ContentFormat,
  ParticipantRole,
} from "@repo/types";
import { maybeTriggerAiTurn } from "../ai-turn/trigger.js";

/** Discriminates who authored a message (mirrors the `message_author_type` enum). */
export type MessageAuthorType = "visitor" | "operator" | "ai" | "system";
import {
  broadcastOrganizationEvent,
  broadcastRoomEvent,
  buildConversationNewEvent,
  buildConversationAcceptedEvent,
  buildConversationReleasedEvent,
  buildConversationResolvedEvent,
  buildMessageNewEvent,
} from "./broadcasting.service.js";
import { serializeLexicalToPlainText } from "@repo/lexical-utils";
import { serializeLexicalToHtml } from "./lexicalSerializer.js";

// ── Custom Errors ──

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = "ConversationNotFoundError";
  }
}

export class ConversationNotActiveError extends Error {
  constructor(conversationId: string, status: string) {
    super(`Conversation ${conversationId} is not active (status: ${status})`);
    this.name = "ConversationNotActiveError";
  }
}

export class ParticipantAlreadyExistsError extends Error {
  constructor(conversationId: string, userId: string) {
    super(
      `User ${userId} is already a participant of conversation ${conversationId}`,
    );
    this.name = "ParticipantAlreadyExistsError";
  }
}

export class MessageNotFoundError extends Error {
  constructor(messageId: string) {
    super(`Message not found: ${messageId}`);
    this.name = "MessageNotFoundError";
  }
}

export class NotMessageSenderError extends Error {
  constructor(messageId: string, userId: string) {
    super(`User ${userId} is not the sender of message ${messageId}`);
    this.name = "NotMessageSenderError";
  }
}

export class MessageEditWindowExpiredError extends Error {
  public readonly createdAt: string;
  public readonly expiresAt: string;
  public readonly windowMinutes: number;

  constructor(messageId: string, createdAt: string, windowMinutes: number) {
    const expiresAt = new Date(
      new Date(createdAt).getTime() + windowMinutes * 60 * 1000,
    ).toISOString();
    super(
      `Message ${messageId} can no longer be modified. The ${windowMinutes}-minute edit window expired at ${expiresAt}.`,
    );
    this.name = "MessageEditWindowExpiredError";
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
    this.windowMinutes = windowMinutes;
  }
}

export class NotAssignedToConversationError extends Error {
  constructor(conversationId: string, userId: string) {
    super(
      `User ${userId} is not authorized to send messages in conversation ${conversationId}`,
    );
    this.name = "NotAssignedToConversationError";
  }
}

export class ConversationAlreadyAssignedError extends Error {
  constructor(conversationId: string) {
    super(
      `Conversation ${conversationId} is already assigned or no longer pending`,
    );
    this.name = "ConversationAlreadyAssignedError";
  }
}

export class ConversationNotAssignedError extends Error {
  constructor(conversationId: string, userId: string) {
    super(`Conversation ${conversationId} is not assigned to user ${userId}`);
    this.name = "ConversationNotAssignedError";
  }
}

export class ConversationUpdateFailedError extends Error {
  constructor(conversationId: string, operation: string) {
    super(`Failed to ${operation} conversation ${conversationId}`);
    this.name = "ConversationUpdateFailedError";
  }
}

export class SystemMessageFailedError extends Error {
  constructor(conversationId: string) {
    super(`Failed to create system message for conversation ${conversationId}`);
    this.name = "SystemMessageFailedError";
  }
}

// ── Constants ──

const EDIT_WINDOW_MINUTES = 15;

// ── Types ──

interface CreateConversationInput {
  organizationId: string;
  applicationId?: string;
  subject?: string;
  createdBy?: string;
  handledBy?: "ai" | "human";
  participants: { userId: string; role: ParticipantRole }[];
}

interface SendMessageInput {
  conversationId: string;
  senderId: string | null;
  content: string;
  contentFormat?: ContentFormat;
  /**
   * Who authored the message. Defaults to `visitor` for backward-compatibility
   * with legacy callers. Only `visitor` messages trigger an autonomous AI turn.
   */
  authorType?: MessageAuthorType;
  broadcastContext?: {
    senderName: string;
    senderRole: ParticipantRole;
  };
}

interface EditMessageInput {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  contentFormat?: ContentFormat;
}

interface DeleteMessageInput {
  messageId: string;
  conversationId: string;
  senderId: string;
}

interface GetMessageHistoryInput {
  conversationId: string;
  limit: number;
  offset: number;
}

interface AddParticipantInput {
  conversationId: string;
  userId: string;
  role: ParticipantRole;
}

// ── Message Enrichment ──

export function enrichMessage<
  T extends { content: string; contentFormat?: ContentFormat | null },
>(message: T): T & { contentHtml: string | null; contentPlainText: string } {
  const format: ContentFormat = (message.contentFormat ??
    "plain") as ContentFormat;
  return {
    ...message,
    contentHtml: serializeLexicalToHtml(message.content, format),
    contentPlainText: serializeLexicalToPlainText(message.content, format),
  };
}

// ── Service Functions ──

export async function createConversation(input: CreateConversationInput) {
  const conversation = await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        applicationId: input.applicationId ?? null,
        status: "pending",
        handledBy: input.handledBy ?? "human",
        createdBy: input.createdBy ?? null,
        subject: input.subject ?? null,
      })
      .returning();

    if (!conv) throw new Error("Failed to create conversation");

    for (const participant of input.participants) {
      await tx.insert(conversationParticipants).values({
        id: crypto.randomUUID(),
        conversationId: conv.id,
        userId: participant.userId,
        role: participant.role,
      });
    }

    return conv;
  });

  try {
    broadcastOrganizationEvent(
      input.organizationId,
      buildConversationNewEvent({
        id: conversation.id,
        organizationId: input.organizationId,
        applicationId: input.applicationId ?? null,
        status: "pending",
        subject: input.subject ?? null,
        createdAt: conversation.createdAt,
      }),
    );
  } catch (err) {
    console.error("[chat.service] createConversation broadcast failed", err);
  }

  return conversation;
}

export async function sendMessage(
  input: SendMessageInput,
  conversationData?: ConversationData,
) {
  let organizationId: string;

  if (!conversationData) {
    const [conversation] = await db
      .select({
        status: conversations.status,
        organizationId: conversations.organizationId,
      })
      .from(conversations)
      .where(eq(conversations.id, input.conversationId))
      .limit(1);

    if (!conversation) {
      throw new ConversationNotFoundError(input.conversationId);
    }

    if (conversation.status !== "active" && conversation.status !== "pending") {
      throw new ConversationNotActiveError(
        input.conversationId,
        conversation.status,
      );
    }

    organizationId = conversation.organizationId;
  } else if (
    conversationData.status !== "active" &&
    conversationData.status !== "pending"
  ) {
    throw new ConversationNotActiveError(
      input.conversationId,
      conversationData.status,
    );
  } else {
    organizationId = conversationData.organizationId;
  }

  const contentFormat = input.contentFormat ?? "plain";
  const authorType: MessageAuthorType = input.authorType ?? "visitor";

  const message = await db.transaction(async (tx) => {
    const [msg] = await tx
      .insert(messages)
      .values({
        id: crypto.randomUUID(),
        conversationId: input.conversationId,
        senderId: input.senderId,
        authorType,
        content: input.content,
        contentFormat,
      })
      .returning();

    if (!msg) throw new Error("Failed to insert message");

    await tx
      .update(conversations)
      .set({ updatedAt: sql`now()` })
      .where(eq(conversations.id, input.conversationId));

    return msg;
  });

  const enriched = enrichMessage(message);

  if (input.broadcastContext) {
    const event = buildMessageNewEvent({
      id: enriched.id,
      conversationId: input.conversationId,
      senderId: input.senderId,
      senderName: input.broadcastContext.senderName,
      senderRole: input.broadcastContext.senderRole,
      content: enriched.content,
      contentFormat,
      contentHtml: enriched.contentHtml,
      type: "text",
      authorType,
      createdAt: enriched.createdAt,
    });

    try {
      broadcastOrganizationEvent(organizationId, event);
    } catch (err) {
      console.error("[chat.service] sendMessage org broadcast failed", err);
    }

    try {
      broadcastRoomEvent(input.conversationId, event);
    } catch (err) {
      console.error("[chat.service] sendMessage room broadcast failed", err);
    }
  }

  // Only a visitor message can prompt an autonomous AI reply. Fire-and-forget:
  // the trigger cheaply checks whether the conversation is AI-handled and, if so,
  // kicks off runAiTurn (which owns its own error handling — never dead air).
  if (authorType === "visitor") {
    void maybeTriggerAiTurn(input.conversationId);
  }

  return enriched;
}

export async function editMessage(input: EditMessageInput) {
  const [msg] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, input.messageId),
        eq(messages.conversationId, input.conversationId),
        isNull(messages.deletedAt),
      ),
    )
    .limit(1);

  if (!msg) {
    throw new MessageNotFoundError(input.messageId);
  }

  if (msg.senderId !== input.senderId) {
    throw new NotMessageSenderError(input.messageId, input.senderId);
  }

  const elapsed = Date.now() - new Date(msg.createdAt).getTime();
  if (elapsed >= EDIT_WINDOW_MINUTES * 60 * 1000) {
    throw new MessageEditWindowExpiredError(
      input.messageId,
      msg.createdAt,
      EDIT_WINDOW_MINUTES,
    );
  }

  const updateValues: Record<string, unknown> = {
    content: input.content,
    editedAt: sql`now()`,
    updatedAt: sql`now()`,
  };
  if (input.contentFormat) {
    updateValues.contentFormat = input.contentFormat;
  }

  const [updated] = await db
    .update(messages)
    .set(updateValues)
    .where(eq(messages.id, input.messageId))
    .returning();

  if (!updated) throw new Error("Failed to update message");

  return enrichMessage(updated);
}

export async function deleteMessage(input: DeleteMessageInput) {
  const [msg] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, input.messageId),
        eq(messages.conversationId, input.conversationId),
        isNull(messages.deletedAt),
      ),
    )
    .limit(1);

  if (!msg) {
    throw new MessageNotFoundError(input.messageId);
  }

  if (msg.senderId !== input.senderId) {
    throw new NotMessageSenderError(input.messageId, input.senderId);
  }

  const elapsed = Date.now() - new Date(msg.createdAt).getTime();
  if (elapsed >= EDIT_WINDOW_MINUTES * 60 * 1000) {
    throw new MessageEditWindowExpiredError(
      input.messageId,
      msg.createdAt,
      EDIT_WINDOW_MINUTES,
    );
  }

  const [deleted] = await db
    .update(messages)
    .set({
      deletedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(messages.id, input.messageId))
    .returning();

  if (!deleted) throw new Error("Failed to delete message");

  return deleted;
}

export async function getMessageHistory(input: GetMessageHistoryInput) {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(input.limit)
    .offset(input.offset);

  return rows.map(enrichMessage);
}

interface GetMessageHistoryForMemberInput {
  conversationId: string;
  organizationId: string;
  limit: number;
  offset: number;
}

export async function getMessageHistoryForMember(
  input: GetMessageHistoryForMemberInput,
) {
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!conv) {
    throw new ConversationNotFoundError(input.conversationId);
  }

  const rows = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      senderName: user.name,
      senderRole: conversationParticipants.role,
      type: messages.type,
      authorType: messages.authorType,
      content: messages.content,
      contentFormat: messages.contentFormat,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(user, eq(messages.senderId, user.id))
    .leftJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, messages.conversationId),
        eq(conversationParticipants.userId, messages.senderId),
      ),
    )
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(input.limit)
    .offset(input.offset);

  return rows.map(enrichMessage);
}

export async function addParticipant(input: AddParticipantInput) {
  const [participant] = await db
    .insert(conversationParticipants)
    .values({
      id: crypto.randomUUID(),
      conversationId: input.conversationId,
      userId: input.userId,
      role: input.role,
    })
    .returning();

  return participant;
}

export async function getConversationWithParticipants(
  conversationId: string,
  organizationId: string,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!conversation) throw new ConversationNotFoundError(conversationId);

  const participants = await db
    .select()
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));

  return { ...conversation, participants };
}

export async function closeConversation(
  conversationId: string,
  organizationId: string,
) {
  const [updated] = await db
    .update(conversations)
    .set({
      status: "closed" as ConversationStatus,
      closedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
      ),
    )
    .returning();

  if (!updated)
    throw new ConversationUpdateFailedError(conversationId, "close");

  return updated;
}

export async function isParticipant(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        isNull(conversationParticipants.leftAt),
      ),
    )
    .limit(1);

  return !!row;
}

export interface ConversationData {
  status: string;
  assignedTo: string | null;
  organizationId: string;
}

export async function validateSendAuthorization(
  conversationId: string,
  senderId: string,
  senderRole: ParticipantRole,
): Promise<ConversationData> {
  const [conversation] = await db
    .select({
      status: conversations.status,
      assignedTo: conversations.assignedTo,
      organizationId: conversations.organizationId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    throw new ConversationNotFoundError(conversationId);
  }

  // Participation is the authorization boundary for everyone. Requiring staff
  // to be the assignee would make two supported flows impossible: an internal
  // staff-only conversation (nobody is assigned) and an admin escalating into a
  // support conversation already assigned to an operator.
  const participantExists = await isParticipant(conversationId, senderId);
  if (!participantExists) {
    throw new NotAssignedToConversationError(conversationId, senderId);
  }

  return conversation;
}

async function broadcastSystemMessage(
  conversationId: string,
  organizationId: string,
  content: string,
): Promise<void> {
  const msg = await createSystemMessage(conversationId, content);
  broadcastOrganizationEvent(
    organizationId,
    buildMessageNewEvent({
      id: msg.id,
      conversationId,
      senderId: null,
      senderName: "",
      senderRole: "operator",
      content: msg.content,
      contentFormat: "plain",
      contentHtml: null,
      type: "system",
      authorType: "system",
      createdAt: msg.createdAt,
    }),
  );
}

export async function acceptConversation(
  conversationId: string,
  organizationId: string,
  operatorId: string,
  operatorName: string,
) {
  const [updated] = await db
    .update(conversations)
    .set({
      status: "active" as ConversationStatus,
      assignedTo: operatorId,
      // Taking over stops the AI: any AI-handled conversation flips to human
      // handling here. This is in the SAME race-safe UPDATE (WHERE assignedTo
      // IS NULL), so a lost race never half-flips. AI-handled conversations run
      // as status='pending' throughout (creation and escalation both leave them
      // pending), so this single guard covers takeover of BOTH an escalated
      // chat and a still-healthy AI chat.
      handledBy: "human",
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
        eq(conversations.status, "pending"),
        isNull(conversations.assignedTo),
      ),
    )
    .returning();

  if (!updated) throw new ConversationAlreadyAssignedError(conversationId);

  try {
    broadcastOrganizationEvent(
      organizationId,
      buildConversationAcceptedEvent({
        conversationId,
        assignedTo: operatorId,
        assignedToName: operatorName,
      }),
    );
  } catch (err) {
    console.error(
      "[chat.service] acceptConversation lifecycle broadcast failed",
      err,
    );
  }

  try {
    await broadcastSystemMessage(
      conversationId,
      organizationId,
      `${operatorName} joined the conversation`,
    );
  } catch (err) {
    console.error(
      "[chat.service] acceptConversation system message failed",
      err,
    );
  }

  return updated;
}

export async function leaveConversation(
  conversationId: string,
  organizationId: string,
  operatorId: string,
  operatorName: string,
) {
  const [updated] = await db
    .update(conversations)
    .set({
      status: "pending" as ConversationStatus,
      assignedTo: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
        eq(conversations.assignedTo, operatorId),
      ),
    )
    .returning();

  if (!updated)
    throw new ConversationNotAssignedError(conversationId, operatorId);

  try {
    broadcastOrganizationEvent(
      organizationId,
      buildConversationReleasedEvent({ conversationId }),
    );
  } catch (err) {
    console.error(
      "[chat.service] leaveConversation lifecycle broadcast failed",
      err,
    );
  }

  try {
    await broadcastSystemMessage(
      conversationId,
      organizationId,
      `${operatorName} left the conversation you'll be able to chat with them again soon`,
    );
  } catch (err) {
    console.error(
      "[chat.service] leaveConversation system message failed",
      err,
    );
  }

  return updated;
}

export async function resolveConversation(
  conversationId: string,
  organizationId: string,
  operatorId: string,
  operatorName: string,
) {
  const [updated] = await db
    .update(conversations)
    .set({
      status: "closed" as ConversationStatus,
      closedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
        eq(conversations.assignedTo, operatorId),
      ),
    )
    .returning();

  if (!updated)
    throw new ConversationNotAssignedError(conversationId, operatorId);

  try {
    broadcastOrganizationEvent(
      organizationId,
      buildConversationResolvedEvent({
        conversationId,
        resolvedBy: operatorId,
      }),
    );
  } catch (err) {
    console.error(
      "[chat.service] resolveConversation lifecycle broadcast failed",
      err,
    );
  }

  try {
    await broadcastSystemMessage(
      conversationId,
      organizationId,
      `${operatorName} resolved the conversation`,
    );
  } catch (err) {
    console.error(
      "[chat.service] resolveConversation system message failed",
      err,
    );
  }

  return updated;
}

export async function updateConversationSubject(
  conversationId: string,
  organizationId: string,
  operatorId: string,
  subject: string,
) {
  const [updated] = await db
    .update(conversations)
    .set({
      subject,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
        eq(conversations.assignedTo, operatorId),
      ),
    )
    .returning();

  if (!updated)
    throw new ConversationNotAssignedError(conversationId, operatorId);

  return updated;
}

export async function createSystemMessage(
  conversationId: string,
  content: string,
) {
  const [msg] = await db
    .insert(messages)
    .values({
      id: crypto.randomUUID(),
      conversationId,
      senderId: null,
      type: "system",
      content,
    })
    .returning();

  if (!msg) throw new SystemMessageFailedError(conversationId);

  return msg;
}

export async function softDeleteConversation(
  conversationId: string,
  organizationId: string,
) {
  const [updated] = await db
    .update(conversations)
    .set({
      deletedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
        isNull(conversations.deletedAt),
      ),
    )
    .returning();

  if (!updated) throw new ConversationNotFoundError(conversationId);

  return updated;
}

export async function getMessagesSince(
  conversationId: string,
  lastMessageId: string,
  limit: number = 100,
) {
  const [lastMsg] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.id, lastMessageId))
    .limit(1);

  if (!lastMsg) return [];

  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        sql`${messages.createdAt} > ${lastMsg.createdAt}`,
      ),
    )
    .orderBy(messages.createdAt)
    .limit(limit);

  return rows.map(enrichMessage);
}

// ── List Conversations for Visitor ──

export async function listConversationsForVisitor(params: {
  applicationId: string;
  organizationId: string;
  visitorUserId: string;
  limit: number;
  offset: number;
}) {
  const { applicationId, organizationId, visitorUserId, limit, offset } =
    params;

  const participantJoin = and(
    eq(conversationParticipants.conversationId, conversations.id),
    eq(conversationParticipants.userId, visitorUserId),
    isNull(conversationParticipants.leftAt),
  );

  const whereClause = and(
    eq(conversations.applicationId, applicationId),
    eq(conversations.organizationId, organizationId),
    isNull(conversations.deletedAt),
  );

  const result = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      subject: conversations.subject,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .innerJoin(conversationParticipants, participantJoin)
    .where(whereClause)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(conversations)
    .innerJoin(conversationParticipants, participantJoin)
    .where(whereClause);

  return {
    conversations: result,
    total: countRow?.total ?? 0,
  };
}

// ── List Conversations (Member) ──

interface ListConversationsForMemberInput {
  organizationId: string;
  userId: string;
  isAdmin: boolean;
  limit: number;
  offset: number;
  status?: ConversationStatus[];
  applicationId?: string;
  assignedTo?: "me";
  handledBy?: "ai" | "human";
}

export async function listConversationsForMember(
  params: ListConversationsForMemberInput,
) {
  const {
    organizationId,
    userId,
    isAdmin,
    limit,
    offset,
    status,
    applicationId,
    assignedTo,
    handledBy,
  } = params;

  const conditions = [
    eq(conversations.organizationId, organizationId),
    isNull(conversations.deletedAt),
  ];

  if (status) conditions.push(inArray(conversations.status, status));
  if (applicationId)
    conditions.push(eq(conversations.applicationId, applicationId));
  if (assignedTo === "me")
    conditions.push(eq(conversations.assignedTo, userId));
  if (handledBy) conditions.push(eq(conversations.handledBy, handledBy));

  if (!isAdmin) {
    // Operators see the human queue plus their own chats. The pending arm
    // excludes AI-handled conversations: a live AI thread stays
    // status='pending' by design (so takeover stays race-safe) and must not
    // surface in the queue until it escalates (which flips handledBy).
    conditions.push(
      or(
        and(
          eq(conversations.status, "pending"),
          eq(conversations.handledBy, "human"),
        ),
        eq(conversations.assignedTo, userId),
      )!,
    );
  }

  const whereClause = and(...conditions);

  const result = await db
    .select()
    .from(conversations)
    .where(whereClause)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(whereClause);

  const assignedIds = result
    .filter((conv) => conv.assignedTo === userId)
    .map((conv) => conv.id);

  const unreadCounts =
    assignedIds.length > 0
      ? await getBulkUnreadCounts(assignedIds, userId)
      : new Map<string, number>();

  const allIds = result.map((conv) => conv.id);
  const lastMessageIds =
    allIds.length > 0
      ? await getBulkLastMessageIds(allIds)
      : new Map<string, string>();

  const conversationsWithUnread = result.map((conv) => ({
    ...conv,
    unreadCount: unreadCounts.get(conv.id) ?? 0,
    lastMessageId: lastMessageIds.get(conv.id) ?? null,
  }));

  return {
    conversations: conversationsWithUnread,
    total: countRow?.count ?? 0,
  };
}

// ── Unread Count ──

async function resolveUnreadCutoff(
  conversationId: string,
  userId: string,
): Promise<string | null> {
  const [participant] = await db
    .select({ lastReadMessageId: conversationParticipants.lastReadMessageId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        isNull(conversationParticipants.leftAt),
      ),
    )
    .limit(1);

  if (!participant?.lastReadMessageId) return null;

  const [lastReadMsg] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.id, participant.lastReadMessageId))
    .limit(1);

  return lastReadMsg?.createdAt ?? null;
}

export async function getUnreadCount(
  conversationId: string,
  userId: string,
): Promise<number> {
  const afterDate = await resolveUnreadCutoff(conversationId, userId);

  const whereConditions = [
    eq(messages.conversationId, conversationId),
    isNull(messages.deletedAt),
  ];
  if (afterDate) {
    whereConditions.push(sql`${messages.createdAt} > ${afterDate}`);
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(distinct ${messages.id})::int` })
    .from(messages)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, messages.conversationId),
        eq(conversationParticipants.userId, messages.senderId),
        eq(conversationParticipants.role, "visitor"),
      ),
    )
    .where(and(...whereConditions));

  return countRow?.count ?? 0;
}

export async function getUnreadCountForVisitor(
  conversationId: string,
  visitorUserId: string,
): Promise<number> {
  const afterDate = await resolveUnreadCutoff(conversationId, visitorUserId);

  const whereConditions = [
    eq(messages.conversationId, conversationId),
    isNull(messages.deletedAt),
    ne(messages.senderId, visitorUserId),
  ];
  if (afterDate) {
    whereConditions.push(sql`${messages.createdAt} > ${afterDate}`);
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(distinct ${messages.id})::int` })
    .from(messages)
    .where(and(...whereConditions));

  return countRow?.count ?? 0;
}

// ── Bulk Unread Counts ──

export async function getBulkUnreadCounts(
  conversationIds: string[],
  userId: string,
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();

  const rows = await db
    .select({
      conversationId: messages.conversationId,
      count: sql<number>`count(distinct ${messages.id})::int`,
    })
    .from(messages)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, messages.conversationId),
        eq(conversationParticipants.userId, messages.senderId),
        eq(conversationParticipants.role, "visitor"),
      ),
    )
    .leftJoin(
      sql`lateral (
        select ${conversationParticipants.lastReadMessageId} as last_read_id
        from ${conversationParticipants} cp2
        where cp2.conversation_id = ${messages.conversationId}
          and cp2.user_id = ${userId}
          and cp2.left_at is null
        limit 1
      ) as reader`,
      sql`true`,
    )
    .leftJoin(
      sql`lateral (
        select created_at as cutoff
        from ${messages} m2
        where m2.id = reader.last_read_id
        limit 1
      ) as cutoff_msg`,
      sql`true`,
    )
    .where(
      and(
        inArray(messages.conversationId, conversationIds),
        isNull(messages.deletedAt),
        sql`(cutoff_msg.cutoff is null or ${messages.createdAt} > cutoff_msg.cutoff)`,
      ),
    )
    .groupBy(messages.conversationId);

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(row.conversationId, row.count);
  }
  return result;
}

async function getBulkLastMessageIds(
  conversationIds: string[],
): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([messages.conversationId], {
      conversationId: messages.conversationId,
      id: messages.id,
    })
    .from(messages)
    .where(
      and(
        inArray(messages.conversationId, conversationIds),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(messages.conversationId, desc(messages.createdAt));

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.conversationId, row.id);
  }
  return result;
}

// ── Mark as Read ──

export async function markAsRead(
  conversationId: string,
  userId: string,
  messageId: string,
): Promise<{ lastReadMessageId: string } | null> {
  const [participant] = await db
    .select({
      id: conversationParticipants.id,
      lastReadMessageId: conversationParticipants.lastReadMessageId,
    })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        isNull(conversationParticipants.leftAt),
      ),
    )
    .limit(1);

  if (!participant) return null;

  if (participant.lastReadMessageId) {
    const [currentMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, participant.lastReadMessageId))
      .limit(1);

    const [newMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!newMsg) return null;
    if (currentMsg && newMsg.createdAt <= currentMsg.createdAt) return null;
  }

  const [updated] = await db
    .update(conversationParticipants)
    .set({ lastReadMessageId: messageId })
    .where(eq(conversationParticipants.id, participant.id))
    .returning();

  return updated ? { lastReadMessageId: messageId } : null;
}
