import { eq, ne, and, sql, isNull, desc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";
import { conversationParticipants } from "../../db/schema/conversationParticipants.js";
import type {
  ConversationStatus,
  ParticipantRole,
} from "@repo/types";

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

export class NotAssignedToConversationError extends Error {
  constructor(conversationId: string, userId: string) {
    super(
      `User ${userId} is not authorized to send messages in conversation ${conversationId}`,
    );
    this.name = "NotAssignedToConversationError";
  }
}

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
  return db.transaction(async (tx) => {
    const [conversation] = await tx
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

    if (!conversation) throw new Error("Failed to create conversation");

    for (const participant of input.participants) {
      await tx.insert(conversationParticipants).values({
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        userId: participant.userId,
        role: participant.role,
      });
    }

    return conversation;
  });
}

export async function sendMessage(
  input: SendMessageInput,
  conversationData?: ConversationData,
) {
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
  }

  const [message] = await db
    .insert(messages)
    .values({
      id: crypto.randomUUID(),
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content,
    })
    .returning();

  if (!message) throw new Error("Failed to insert message");

  await db
    .update(conversations)
    .set({ updatedAt: sql`now()` })
    .where(eq(conversations.id, input.conversationId));

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

export async function acceptConversation(
  conversationId: string,
  organizationId: string,
  operatorId: string,
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

  return updated ?? null;
}

export async function leaveConversation(
  conversationId: string,
  organizationId: string,
  operatorId: string,
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

  return updated ?? null;
}

export async function resolveConversation(
  conversationId: string,
  organizationId: string,
  operatorId: string,
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

  return updated ?? null;
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

// ── Unread Count ──

export async function getUnreadCount(
  conversationId: string,
  userId: string,
): Promise<number> {
  // Find if the user is a participant (they may not be for pending/queue conversations)
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

  // Determine the cutoff: messages after this date are "unread"
  let afterDate: string | null = null;
  if (participant?.lastReadMessageId) {
    const [lastReadMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, participant.lastReadMessageId))
      .limit(1);
    afterDate = lastReadMsg?.createdAt ?? null;
  }
  // If no participant or no lastReadMessageId → afterDate stays null → count ALL visitor messages

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

// ── Unread Count (Visitor) ──

export async function getUnreadCountForVisitor(
  conversationId: string,
  visitorUserId: string,
): Promise<number> {
  const [participant] = await db
    .select({ lastReadMessageId: conversationParticipants.lastReadMessageId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, visitorUserId),
        isNull(conversationParticipants.leftAt),
      ),
    )
    .limit(1);

  let afterDate: string | null = null;
  if (participant?.lastReadMessageId) {
    const [lastReadMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, participant.lastReadMessageId))
      .limit(1);
    afterDate = lastReadMsg?.createdAt ?? null;
  }

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
