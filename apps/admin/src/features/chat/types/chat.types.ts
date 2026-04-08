import type {
  ConversationType,
  ConversationStatus,
  ParticipantRole,
  MessageType,
} from "@repo/types";

export type Conversation = {
  id: string;
  organizationId: string;
  applicationId: string | null;
  type: ConversationType;
  status: ConversationStatus;
  createdBy: string | null;
  assignedTo: string | null;
  subject: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationParticipant = {
  id: string;
  conversationId: string;
  userId: string;
  role: ParticipantRole;
  lastReadMessageId: string | null;
  joinedAt: string;
  leftAt: string | null;
};

export type ConversationWithParticipants = Conversation & {
  participants: ConversationParticipant[];
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  senderRole: "visitor" | "operator" | "admin" | null;
  type: MessageType;
  content: string;
  createdAt: string;
};

export type ConversationsListResponse = {
  conversations: Conversation[];
  total: number;
  limit: number;
  offset: number;
};

export type ConversationDetailResponse = {
  conversation: ConversationWithParticipants;
};

export type MessagesListResponse = {
  messages: Message[];
  limit: number;
  offset: number;
};

export type ConversationFilters = {
  status?: ConversationStatus;
  type?: ConversationType;
  applicationId?: string;
  limit: number;
  offset: number;
};
