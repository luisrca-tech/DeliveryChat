import { eq, ne, and, sql, isNull, desc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";
import { conversationParticipants } from "../../db/schema/conversationParticipants.js";
import type {
  ConversationStatus,
  ParticipantRole,
} from "@repo/types";
import {
  broadcastOrganizationEvent,
  buildConversationNewEvent,
  buildConversationAcceptedEvent,
  buildConversationReleasedEvent,
  buildConversationResolvedEvent,
  buildMessageNewEvent,
} from "./broadcasting.service.js";

// ── Custom Errors ──

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
    this.name = "ConversationNotFoundError";
  }
}

export class ConversationNotActiveError extends Error {
  constructor(conversationId: string, status: string) {
    super(
      `Conversation ${conversationId} is not active (status: ${status})`,
    );
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

// ── Constants ──

const EDIT_WINDOW_MINUTES = 15;

// ── Types ──

interface CreateConversationInput {
  organizationId: string;
  applicationId?: string;
  subject?: string;
  createdBy?: string;
  participants: { userId: string; role: ParticipantRole }[];
}

interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
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

  const message = await db.transaction(async (tx) => {
    const [msg] = await tx
      .insert(messages)
      .values({
        id: crypto.randomUUID(),
        conversationId: input.conversationId,
        senderId: input.senderId,
        content: input.content,
      })
      .returning();

    if (!msg) throw new Error("Failed to insert message");

    await tx
      .update(conversations)
      .set({ updatedAt: sql`now()` })
      .where(eq(conversations.id, input.conversationId));

    return msg;
  });

  if (input.broadcastContext) {
    try {
      broadcastOrganizationEvent(
        organizationId,
        buildMessageNewEvent({
          id: message.id,
          conversationId: input.conversationId,
          senderId: input.senderId,
          senderName: input.broadcastContext.senderName,
          senderRole: input.broadcastContext.senderRole,
          content: message.content,
          type: "text",
          createdAt: message.createdAt,
        }),
      );
    } catch (err) {
      console.error("[chat.service] sendMessage broadcast failed", err);
    }
  }

  return message;
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

  const [updated] = await db
    .update(messages)
    .set({
      content: input.content,
      editedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(messages.id, input.messageId))
    .returning();

  if (!updated) throw new Error("Failed to update message");

  return updated;
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
  return db
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

  if (!conversation) return null;

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

  return updated ?? null;
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

  if (senderRole === "visitor") {
    const participantExists = await isParticipant(conversationId, senderId);
    if (!participantExists) {
      throw new NotAssignedToConversationError(conversationId, senderId);
    }
    return conversation;
  }

  if (conversation.assignedTo !== senderId) {
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
  if (!msg) return;
  broadcastOrganizationEvent(
    organizationId,
    buildMessageNewEvent({
      id: msg.id,
      conversationId,
      senderId: null,
      senderName: "",
      senderRole: "operator",
      content: msg.content,
      type: "system",
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

  if (!updated) return null;

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
    console.error("[chat.service] acceptConversation lifecycle broadcast failed", err);
  }

  try {
    await broadcastSystemMessage(
      conversationId,
      organizationId,
      `${operatorName} joined the conversation`,
    );
  } catch (err) {
    console.error("[chat.service] acceptConversation system message failed", err);
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

  if (!updated) return null;

  try {
    broadcastOrganizationEvent(
      organizationId,
      buildConversationReleasedEvent({ conversationId }),
    );
  } catch (err) {
    console.error("[chat.service] leaveConversation lifecycle broadcast failed", err);
  }

  try {
    await broadcastSystemMessage(
      conversationId,
      organizationId,
      `${operatorName} left the conversation. You'll be placed back in the queue immediately.`,
    );
  } catch (err) {
    console.error("[chat.service] leaveConversation system message failed", err);
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

  if (!updated) return null;

  try {
    broadcastOrganizationEvent(
      organizationId,
      buildConversationResolvedEvent({
        conversationId,
        resolvedBy: operatorId,
      }),
    );
  } catch (err) {
    console.error("[chat.service] resolveConversation lifecycle broadcast failed", err);
  }

  try {
    await broadcastSystemMessage(
      conversationId,
      organizationId,
      `${operatorName} resolved the conversation`,
    );
  } catch (err) {
    console.error("[chat.service] resolveConversation system message failed", err);
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

  return updated ?? null;
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

  return msg ?? null;
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

  return updated ?? null;
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

  return db
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
