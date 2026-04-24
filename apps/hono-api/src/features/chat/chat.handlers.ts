import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import type { IRoomManager, WSConnection } from "./room-manager.js";
import { wsClientEventSchema } from "./chat.schemas.js";
import {
  sendMessage,
  editMessage,
  deleteMessage,
  isParticipant,
  getMessagesSince,
  validateSendAuthorization,
  NotAssignedToConversationError,
  ConversationNotFoundError,
  ConversationNotActiveError,
  MessageNotFoundError,
  NotMessageSenderError,
} from "./chat.service.js";
import type {
  WSServerEvent,
  MessageNewPayload,
} from "@repo/types";
import type { RateLimitCheckResult } from "../../lib/middleware/visitorRateLimit.js";

type VisitorRateLimiter = {
  check(key: string): RateLimitCheckResult;
};

type EventHandlerOptions = {
  visitorRateLimiter?: VisitorRateLimiter;
};

function sendEvent(conn: WSConnection, event: WSServerEvent) {
  conn.ws.send(JSON.stringify(event));
}

function sendError(conn: WSConnection, code: string, message: string) {
  sendEvent(conn, { type: "error", payload: { code, message } });
}

function sendRateLimitError(conn: WSConnection, retryAfter: number) {
  conn.ws.send(
    JSON.stringify({
      type: "error",
      payload: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded. Please wait before sending another message.",
        retryAfter,
      },
    }),
  );
}

export function createEventHandler(
  roomManager: IRoomManager,
  options?: EventHandlerOptions,
) {
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
        if (conn.role === "visitor" && options?.visitorRateLimiter) {
          const appId = conn.applicationId ?? conn.organizationId;
          const key = `visitor:${appId}:${conn.userId}`;
          const check = options.visitorRateLimiter.check(key);
          if (!check.allowed) {
            sendRateLimitError(conn, check.retryAfter);
            return;
          }
        }
        await handleMessageSend(conn, event.payload, roomManager);
        break;
      case "message:edit":
        await handleMessageEdit(conn, event.payload, roomManager);
        break;
      case "message:delete":
        await handleMessageDelete(conn, event.payload, roomManager);
        break;
      case "typing:start":
        handleTypingStart(conn, event.payload, roomManager);
        break;
      case "typing:stop":
        handleTypingStop(conn, event.payload, roomManager);
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

  let message;
  try {
    message = await sendMessage({
      conversationId: payload.conversationId,
      senderId: conn.userId,
      content: payload.content,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (
      error instanceof ConversationNotFoundError ||
      (error instanceof Error && error.name === "ConversationNotFoundError")
    ) {
      sendError(conn, "CONVERSATION_NOT_FOUND", msg);
      return;
    }
    if (
      error instanceof ConversationNotActiveError ||
      (error instanceof Error && error.name === "ConversationNotActiveError")
    ) {
      sendError(conn, "CONVERSATION_NOT_ACTIVE", msg);
      return;
    }
    throw error;
  }

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

  // Fetch assignedTo for the broadcast payload
  const [conv] = await db
    .select({ assignedTo: conversations.assignedTo })
    .from(conversations)
    .where(eq(conversations.id, payload.conversationId))
    .limit(1);

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
      assignedTo: conv?.assignedTo ?? null,
    },
  };

  const eventStr = JSON.stringify(broadcastEvent);

  // Broadcast to participants in the room
  roomManager.broadcast(payload.conversationId, eventStr, conn.id);

  // Also notify all org staff (for unread badges on conversations they're not viewing)
  roomManager.broadcastToOrganization(conn.organizationId, eventStr, conn.id);
}

async function handleMessageEdit(
  conn: WSConnection,
  payload: { conversationId: string; messageId: string; content: string },
  roomManager: IRoomManager,
) {
  try {
    const updated = await editMessage({
      messageId: payload.messageId,
      conversationId: payload.conversationId,
      senderId: conn.userId,
      content: payload.content,
    });

    const broadcastEvent: WSServerEvent = {
      type: "message:edited",
      payload: {
        conversationId: payload.conversationId,
        messageId: updated.id,
        content: updated.content,
        editedAt: updated.editedAt!,
        senderId: conn.userId,
      },
    };

    roomManager.broadcast(
      payload.conversationId,
      JSON.stringify(broadcastEvent),
    );
  } catch (error) {
    if (error instanceof MessageNotFoundError) {
      sendError(conn, "MESSAGE_NOT_FOUND", error.message);
      return;
    }
    if (error instanceof NotMessageSenderError) {
      sendError(conn, "FORBIDDEN", error.message);
      return;
    }
    throw error;
  }
}

async function handleMessageDelete(
  conn: WSConnection,
  payload: { conversationId: string; messageId: string },
  roomManager: IRoomManager,
) {
  try {
    await deleteMessage({
      messageId: payload.messageId,
      conversationId: payload.conversationId,
      senderId: conn.userId,
    });

    const broadcastEvent: WSServerEvent = {
      type: "message:deleted",
      payload: {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        senderId: conn.userId,
      },
    };

    roomManager.broadcast(
      payload.conversationId,
      JSON.stringify(broadcastEvent),
    );
  } catch (error) {
    if (error instanceof MessageNotFoundError) {
      sendError(conn, "MESSAGE_NOT_FOUND", error.message);
      return;
    }
    if (error instanceof NotMessageSenderError) {
      sendError(conn, "FORBIDDEN", error.message);
      return;
    }
    throw error;
  }
}

function handleTypingStart(
  conn: WSConnection,
  payload: { conversationId: string },
  roomManager: IRoomManager,
) {
  const broadcastEvent: WSServerEvent = {
    type: "typing:start",
    payload: {
      conversationId: payload.conversationId,
      userId: conn.userId,
      userName: conn.userName,
      senderRole: conn.role,
    },
  };

  roomManager.broadcast(
    payload.conversationId,
    JSON.stringify(broadcastEvent),
    conn.id,
  );
}

function handleTypingStop(
  conn: WSConnection,
  payload: { conversationId: string },
  roomManager: IRoomManager,
) {
  const broadcastEvent: WSServerEvent = {
    type: "typing:stop",
    payload: {
      conversationId: payload.conversationId,
      userId: conn.userId,
    },
  };

  roomManager.broadcast(
    payload.conversationId,
    JSON.stringify(broadcastEvent),
    conn.id,
  );
}
