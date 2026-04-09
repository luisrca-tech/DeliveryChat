import type { IRoomManager, WSConnection } from "./room-manager.js";
import { wsClientEventSchema } from "./chat.schemas.js";
import {
  sendMessage,
  isParticipant,
  getMessagesSince,
  validateSendAuthorization,
  NotAssignedToConversationError,
} from "./chat.service.js";
import type {
  WSServerEvent,
  MessageNewPayload,
} from "@repo/types";

function sendEvent(conn: WSConnection, event: WSServerEvent) {
  conn.ws.send(JSON.stringify(event));
}

function sendError(conn: WSConnection, code: string, message: string) {
  sendEvent(conn, { type: "error", payload: { code, message } });
}

export function createEventHandler(roomManager: IRoomManager) {
  return async function handleMessage(
    conn: WSConnection,
    raw: string,
  ): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendError(conn, "PARSE_ERROR", "Invalid JSON");
      return;
    }

    const result = wsClientEventSchema.safeParse(parsed);
    if (!result.success) {
      sendError(conn, "VALIDATION_ERROR", result.error.issues[0]?.message ?? "Invalid event");
      return;
    }

    const event = result.data;
    console.log(`[WS:Handler] event=${event.type} connId=${conn.id} userId=${conn.userId} role=${conn.role}`);

    switch (event.type) {
      case "room:join":
        await handleRoomJoin(conn, event.payload, roomManager);
        break;
      case "room:leave":
        handleRoomLeave(conn, event.payload, roomManager);
        break;
      case "message:send":
        await handleMessageSend(conn, event.payload, roomManager);
        break;
      case "ping":
        sendEvent(conn, { type: "pong" });
        break;
    }
  };
}

async function handleRoomJoin(
  conn: WSConnection,
  payload: { conversationId: string; lastMessageId?: string },
  roomManager: IRoomManager,
) {
  const canJoin = await isParticipant(payload.conversationId, conn.userId);
  console.log(`[WS:Handler] room:join convId=${payload.conversationId} userId=${conn.userId} canJoin=${canJoin}`);

  if (!canJoin) {
    sendError(conn, "FORBIDDEN", "Not a participant of this conversation");
    return;
  }

  roomManager.join(payload.conversationId, conn);

  if (payload.lastMessageId) {
    const missedMessages = await getMessagesSince(
      payload.conversationId,
      payload.lastMessageId,
    );

    if (missedMessages.length > 0) {
      sendEvent(conn, {
        type: "messages:sync",
        payload: {
          conversationId: payload.conversationId,
          messages: missedMessages.map(
            (msg): MessageNewPayload => ({
              id: msg.id,
              conversationId: msg.conversationId,
              senderId: msg.senderId,
              senderName: "",
              senderRole: conn.role,
              content: msg.content,
              type: msg.type as "text" | "system",
              createdAt: msg.createdAt,
            }),
          ),
        },
      });
    }
  }
}

function handleRoomLeave(
  conn: WSConnection,
  payload: { conversationId: string },
  roomManager: IRoomManager,
) {
  roomManager.leave(payload.conversationId, conn.id);
}

async function handleMessageSend(
  conn: WSConnection,
  payload: { conversationId: string; content: string; clientMessageId: string },
  roomManager: IRoomManager,
) {
  try {
    await validateSendAuthorization(
      payload.conversationId,
      conn.userId,
      conn.role,
    );
  } catch (error) {
    if (error instanceof NotAssignedToConversationError) {
      sendError(conn, "FORBIDDEN", error.message);
      return;
    }
    throw error;
  }

  console.log(`[WS:Handler] message:send convId=${payload.conversationId} senderId=${conn.userId} role=${conn.role}`);

  const message = await sendMessage({
    conversationId: payload.conversationId,
    senderId: conn.userId,
    content: payload.content,
  });

  console.log(`[WS:Handler] message persisted msgId=${message.id} — broadcasting to room`);

  // ACK to sender
  sendEvent(conn, {
    type: "message:ack",
    payload: {
      clientMessageId: payload.clientMessageId,
      serverMessageId: message.id,
      createdAt: message.createdAt,
    },
  });

  // Broadcast to other participants in the room
  const broadcastEvent: WSServerEvent = {
    type: "message:new",
    payload: {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: "",
      senderRole: conn.role,
      content: message.content,
      type: message.type as "text" | "system",
      createdAt: message.createdAt,
    },
  };

  roomManager.broadcast(
    payload.conversationId,
    JSON.stringify(broadcastEvent),
    conn.id,
  );
}
