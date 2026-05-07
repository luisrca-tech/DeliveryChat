import type {
  WSServerEvent,
  ConversationNewPayload,
  MessageNewPayload,
  ConversationAcceptedPayload,
  ConversationReleasedPayload,
  ConversationResolvedPayload,
  MessageEditedPayload,
  MessageDeletedPayload,
  TypingStartBroadcastPayload,
  TypingStopBroadcastPayload,
  WSServerEventType,
} from "@repo/types";
import { roomManager } from "./room-manager-instance.js";

export function buildConversationNewEvent(
  payload: ConversationNewPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.CONVERSATION_NEW }> {
  return { type: "conversation:new", payload };
}

export function buildMessageNewEvent(
  payload: MessageNewPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.MESSAGE_NEW }> {
  return { type: "message:new", payload };
}

export function buildConversationAcceptedEvent(
  payload: ConversationAcceptedPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.CONVERSATION_ACCEPTED }> {
  return { type: "conversation:accepted", payload };
}

export function buildConversationReleasedEvent(
  payload: ConversationReleasedPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.CONVERSATION_RELEASED }> {
  return { type: "conversation:released", payload };
}

export function buildConversationResolvedEvent(
  payload: ConversationResolvedPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.CONVERSATION_RESOLVED }> {
  return { type: "conversation:resolved", payload };
}

export function buildMessageEditedEvent(
  payload: MessageEditedPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.MESSAGE_EDITED }> {
  return { type: "message:edited", payload };
}

export function buildMessageDeletedEvent(
  payload: MessageDeletedPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.MESSAGE_DELETED }> {
  return { type: "message:deleted", payload };
}

export function buildTypingStartEvent(
  payload: TypingStartBroadcastPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.TYPING_START }> {
  return { type: "typing:start", payload };
}

export function buildTypingStopEvent(
  payload: TypingStopBroadcastPayload,
): Extract<WSServerEvent, { type: typeof WSServerEventType.TYPING_STOP }> {
  return { type: "typing:stop", payload };
}

export function broadcastOrganizationEvent(
  organizationId: string,
  event: WSServerEvent,
  excludeConnectionId?: string,
): void {
  roomManager.broadcastToOrganization(organizationId, JSON.stringify(event), excludeConnectionId);
}

export function broadcastRoomEvent(
  conversationId: string,
  event: WSServerEvent,
  excludeConnectionId?: string,
): void {
  roomManager.broadcast(conversationId, JSON.stringify(event), excludeConnectionId);
}

export function broadcastStaffEvent(
  organizationId: string,
  event: WSServerEvent,
  excludeConnectionId?: string,
): void {
  roomManager.broadcastToStaff(organizationId, JSON.stringify(event), excludeConnectionId);
}
