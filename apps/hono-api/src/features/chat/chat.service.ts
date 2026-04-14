import { eq, and, sql, isNull, desc } from "drizzle-orm";
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

export async function sendMessage(input: SendMessageInput) {
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

export async function validateSendAuthorization(
  conversationId: string,
  senderId: string,
  senderRole: ParticipantRole,
): Promise<void> {
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
    return;
  }

  // Staff (operator, admin): must be the assignedTo user
  if (conversation.assignedTo !== senderId) {
    throw new NotAssignedToConversationError(conversationId, senderId);
  }
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
