// ── Enums aligned with DB schema ──

export const ConversationStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  CLOSED: "closed",
} as const;
export type ConversationStatus =
  (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const MessageType = {
  TEXT: "text",
  SYSTEM: "system",
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const ParticipantRole = {
  VISITOR: "visitor",
  OPERATOR: "operator",
  ADMIN: "admin",
} as const;
export type ParticipantRole =
  (typeof ParticipantRole)[keyof typeof ParticipantRole];

// ── Client → Server Events ──

export const WSClientEventType = {
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  MESSAGE_SEND: "message:send",
  MESSAGE_EDIT: "message:edit",
  MESSAGE_DELETE: "message:delete",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  PING: "ping",
} as const;
export type WSClientEventType =
  (typeof WSClientEventType)[keyof typeof WSClientEventType];

export interface RoomJoinPayload {
  conversationId: string;
  lastMessageId?: string;
}

export interface RoomLeavePayload {
  conversationId: string;
}

export interface MessageSendPayload {
  conversationId: string;
  content: string;
  clientMessageId: string;
}

export interface MessageEditPayload {
  conversationId: string;
  messageId: string;
  content: string;
}

export interface MessageDeletePayload {
  conversationId: string;
  messageId: string;
}

export interface TypingStartPayload {
  conversationId: string;
}

export interface TypingStopPayload {
  conversationId: string;
}

export type WSClientEvent =
  | { type: typeof WSClientEventType.ROOM_JOIN; payload: RoomJoinPayload }
  | { type: typeof WSClientEventType.ROOM_LEAVE; payload: RoomLeavePayload }
  | { type: typeof WSClientEventType.MESSAGE_SEND; payload: MessageSendPayload }
  | { type: typeof WSClientEventType.MESSAGE_EDIT; payload: MessageEditPayload }
  | { type: typeof WSClientEventType.MESSAGE_DELETE; payload: MessageDeletePayload }
  | { type: typeof WSClientEventType.TYPING_START; payload: TypingStartPayload }
  | { type: typeof WSClientEventType.TYPING_STOP; payload: TypingStopPayload }
  | { type: typeof WSClientEventType.PING };

// ── Server → Client Events ──

export const WSServerEventType = {
  MESSAGE_NEW: "message:new",
  MESSAGE_ACK: "message:ack",
  MESSAGE_EDITED: "message:edited",
  MESSAGE_DELETED: "message:deleted",
  MESSAGES_SYNC: "messages:sync",
  CONVERSATION_NEW: "conversation:new",
  CONVERSATION_ACCEPTED: "conversation:accepted",
  CONVERSATION_RELEASED: "conversation:released",
  CONVERSATION_RESOLVED: "conversation:resolved",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  ERROR: "error",
  PONG: "pong",
} as const;
export type WSServerEventType =
  (typeof WSServerEventType)[keyof typeof WSServerEventType];

export interface MessageNewPayload {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: ParticipantRole;
  content: string;
  type: MessageType;
  createdAt: string;
  editedAt?: string | null;
  assignedTo?: string | null;
}

export interface MessageAckPayload {
  clientMessageId: string;
  serverMessageId: string;
  createdAt: string;
}

export interface MessageEditedPayload {
  conversationId: string;
  messageId: string;
  content: string;
  editedAt: string;
  senderId: string;
}

export interface MessageDeletedPayload {
  conversationId: string;
  messageId: string;
  senderId: string;
}

export interface MessagesSyncPayload {
  conversationId: string;
  messages: MessageNewPayload[];
}

export interface ConversationNewPayload {
  id: string;
  organizationId: string;
  applicationId: string | null;
  status: ConversationStatus;
  subject: string | null;
  createdAt: string;
}

export interface ConversationAcceptedPayload {
  conversationId: string;
  assignedTo: string;
  assignedToName: string;
}

export interface ConversationReleasedPayload {
  conversationId: string;
}

export interface ConversationResolvedPayload {
  conversationId: string;
  resolvedBy: string;
}

export interface TypingStartBroadcastPayload {
  conversationId: string;
  userId: string;
  userName: string | null;
  senderRole: ParticipantRole;
}

export interface TypingStopBroadcastPayload {
  conversationId: string;
  userId: string;
}

export interface WSErrorPayload {
  code: string;
  message: string;
}

export type WSServerEvent =
  | { type: typeof WSServerEventType.MESSAGE_NEW; payload: MessageNewPayload }
  | { type: typeof WSServerEventType.MESSAGE_ACK; payload: MessageAckPayload }
  | {
      type: typeof WSServerEventType.MESSAGE_EDITED;
      payload: MessageEditedPayload;
    }
  | {
      type: typeof WSServerEventType.MESSAGE_DELETED;
      payload: MessageDeletedPayload;
    }
  | {
      type: typeof WSServerEventType.MESSAGES_SYNC;
      payload: MessagesSyncPayload;
    }
  | {
      type: typeof WSServerEventType.CONVERSATION_NEW;
      payload: ConversationNewPayload;
    }
  | {
      type: typeof WSServerEventType.CONVERSATION_ACCEPTED;
      payload: ConversationAcceptedPayload;
    }
  | {
      type: typeof WSServerEventType.CONVERSATION_RELEASED;
      payload: ConversationReleasedPayload;
    }
  | {
      type: typeof WSServerEventType.CONVERSATION_RESOLVED;
      payload: ConversationResolvedPayload;
    }
  | {
      type: typeof WSServerEventType.TYPING_START;
      payload: TypingStartBroadcastPayload;
    }
  | {
      type: typeof WSServerEventType.TYPING_STOP;
      payload: TypingStopBroadcastPayload;
    }
  | { type: typeof WSServerEventType.ERROR; payload: WSErrorPayload }
  | { type: typeof WSServerEventType.PONG };
