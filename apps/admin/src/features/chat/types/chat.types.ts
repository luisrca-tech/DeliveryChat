import type {
  ConversationStatus,
  ParticipantRole,
  MessageType,
  ContentFormat,
  MessageAuthorType,
} from "@repo/types";

export type ConversationHandledBy = "ai" | "human";

export type Conversation = {
  id: string;
  organizationId: string;
  applicationId: string | null;
  status: ConversationStatus;
  createdBy: string | null;
  assignedTo: string | null;
  subject: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessageId: string | null;
  handledBy?: ConversationHandledBy;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  handoffSummary?: string | null;
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
  contentFormat: ContentFormat;
  contentHtml: string | null;
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
  authorType?: MessageAuthorType;
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
  status?: ConversationStatus | ConversationStatus[];
  applicationId?: string;
  assignedTo?: "me";
  handledBy?: "ai" | "human";
  limit: number;
  offset: number;
};

export type WebSocketHandlerContext = {
  activeConversationId: string | null;
  processedMsgIds: Set<string>;
  messagesQueryKey: (conversationId: string) => readonly unknown[];
  invalidateQueries: () => void;
  setQueryData: (
    queryKey: readonly unknown[],
    updater: (old: unknown) => unknown,
  ) => void;
  markAsRead: (conversationId: string, messageId: string) => Promise<unknown>;
};
