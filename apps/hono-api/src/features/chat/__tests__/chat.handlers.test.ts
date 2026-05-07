import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemoryRoomManager } from "../room-manager.js";
import type { WSConnection } from "../room-manager.js";
import { createEventHandler } from "../chat.handlers.js";
import { createVisitorWsRateLimiter } from "../../../lib/middleware/visitorRateLimit.js";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../../../db/schema/conversations.js", () => ({
  conversations: { id: "id", assignedTo: "assignedTo" },
}));

vi.mock("../chat.service.js", () => {
  class NotAssignedToConversationError extends Error {
    constructor(conversationId: string, userId: string) {
      super(
        `User ${userId} is not authorized to send messages in conversation ${conversationId}`,
      );
      this.name = "NotAssignedToConversationError";
    }
  }

  class ConversationNotFoundError extends Error {
    constructor(conversationId: string) {
      super(`Conversation not found: ${conversationId}`);
      this.name = "ConversationNotFoundError";
    }
  }

  class ConversationNotActiveError extends Error {
    constructor(conversationId: string, status: string) {
      super(
        `Conversation ${conversationId} is not active (status: ${status})`,
      );
      this.name = "ConversationNotActiveError";
    }
  }

  class MessageNotFoundError extends Error {
    constructor(messageId: string) {
      super(`Message not found: ${messageId}`);
      this.name = "MessageNotFoundError";
    }
  }

  class NotMessageSenderError extends Error {
    constructor(messageId: string, userId: string) {
      super(`User ${userId} is not the sender of message ${messageId}`);
      this.name = "NotMessageSenderError";
    }
  }

  class MessageEditWindowExpiredError extends Error {
    public readonly createdAt: string;
    public readonly windowMinutes: number;
    constructor(messageId: string, createdAt: string, windowMinutes: number) {
      super(`Message ${messageId} can no longer be modified. The ${windowMinutes}-minute edit window expired at ${createdAt}.`);
      this.name = "MessageEditWindowExpiredError";
      this.createdAt = createdAt;
      this.windowMinutes = windowMinutes;
    }
  }

  return {
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    isParticipant: vi.fn(),
    getMessagesSince: vi.fn(),
    validateSendAuthorization: vi.fn(),
    NotAssignedToConversationError,
    ConversationNotFoundError,
    ConversationNotActiveError,
    MessageNotFoundError,
    NotMessageSenderError,
    MessageEditWindowExpiredError,
  };
});

const {
  sendMessage,
  editMessage,
  deleteMessage: deleteMessageService,
  isParticipant,
  getMessagesSince,
  validateSendAuthorization,
  NotAssignedToConversationError,
  ConversationNotActiveError,
  MessageNotFoundError,
  NotMessageSenderError,
  MessageEditWindowExpiredError,
} = (await import("../chat.service.js")) as any;

const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>;
const mockEditMessage = editMessage as ReturnType<typeof vi.fn>;
const mockDeleteMessage = deleteMessageService as ReturnType<typeof vi.fn>;
const mockIsParticipant = isParticipant as ReturnType<typeof vi.fn>;
const mockGetMessagesSince = getMessagesSince as ReturnType<typeof vi.fn>;
const mockValidateSendAuthorization = validateSendAuthorization as ReturnType<typeof vi.fn>;

function firstWsSendPayload(sendMock: ReturnType<typeof vi.fn>): string {
  const arg = sendMock.mock.calls[0]?.[0];
  if (typeof arg !== "string") {
    throw new Error("Expected ws.send first argument to be a string");
  }
  return arg;
}

function createMockConnection(
  overrides: Partial<WSConnection> = {},
): WSConnection {
  return {
    id: "conn-1",
    userId: "user-1",
    userName: "Test User",
    organizationId: "org-1",
    role: "operator" as const,
    ws: {
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WSConnection["ws"],
    ...overrides,
  };
}

describe("chat.handlers", () => {
  let roomManager: InMemoryRoomManager;
  let handler: ReturnType<typeof createEventHandler>;
  let conn: WSConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    roomManager = new InMemoryRoomManager();
    handler = createEventHandler(roomManager);
    conn = createMockConnection();
  });

  describe("room:join", () => {
    it("joins a room when user is a participant", async () => {
      mockIsParticipant.mockResolvedValue(true);

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: {
            conversationId: "550e8400-e29b-41d4-a716-446655440000",
          },
        }),
      );

      expect(
        roomManager.getConnections("550e8400-e29b-41d4-a716-446655440000"),
      ).toHaveLength(1);
    });

    it("sends sync messages when lastMessageId is provided", async () => {
      mockIsParticipant.mockResolvedValue(true);
      const missedMessages = [
        {
          id: "msg-2",
          conversationId: "conv-1",
          senderId: "user-2",
          content: "Missed msg",
          type: "text",
          createdAt: "2026-01-01T00:01:00Z",
        },
      ];
      mockGetMessagesSince.mockResolvedValue(missedMessages);

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: {
            conversationId: "550e8400-e29b-41d4-a716-446655440000",
            lastMessageId: "550e8400-e29b-41d4-a716-446655440001",
          },
        }),
      );

      expect(conn.ws.send).toHaveBeenCalled();
      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("messages:sync");
    });

    it("sends error when user is not a participant", async () => {
      mockIsParticipant.mockResolvedValue(false);

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: {
            conversationId: "550e8400-e29b-41d4-a716-446655440000",
          },
        }),
      );

      expect(
        roomManager.getConnections("550e8400-e29b-41d4-a716-446655440000"),
      ).toHaveLength(0);

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("FORBIDDEN");
    });
  });

  describe("room:leave", () => {
    it("removes connection from room", async () => {
      mockIsParticipant.mockResolvedValue(true);

      // First join
      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: {
            conversationId: "550e8400-e29b-41d4-a716-446655440000",
          },
        }),
      );

      // Then leave
      await handler(
        conn,
        JSON.stringify({
          type: "room:leave",
          payload: {
            conversationId: "550e8400-e29b-41d4-a716-446655440000",
          },
        }),
      );

      expect(
        roomManager.getConnections("550e8400-e29b-41d4-a716-446655440000"),
      ).toHaveLength(0);
    });
  });

  describe("message:send", () => {
    const convData = { status: "active", assignedTo: "user-1", organizationId: "org-1" };

    it("persists message and broadcasts to room with assignedTo from validation", async () => {
      mockIsParticipant.mockResolvedValue(true);
      const convId = "550e8400-e29b-41d4-a716-446655440000";

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: { conversationId: convId },
        }),
      );

      const conn2 = createMockConnection({
        id: "conn-2",
        userId: "user-2",
        role: "visitor" as const,
      });
      roomManager.join(convId, conn2);

      const savedMessage = {
        id: "msg-1",
        conversationId: convId,
        senderId: "user-1",
        content: "Hello!",
        type: "text",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      };
      mockValidateSendAuthorization.mockResolvedValue(convData);
      mockSendMessage.mockResolvedValue(savedMessage);

      vi.clearAllMocks();
      mockValidateSendAuthorization.mockResolvedValue(convData);
      mockSendMessage.mockResolvedValue(savedMessage);

      await handler(
        conn,
        JSON.stringify({
          type: "message:send",
          payload: {
            conversationId: convId,
            content: "Hello!",
            clientMessageId: "client-msg-1",
          },
        }),
      );

      const senderCalls = (conn.ws.send as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(senderCalls.length).toBeGreaterThanOrEqual(1);
      const ackEvent = JSON.parse(senderCalls[0]?.[0] as string);
      expect(ackEvent.type).toBe("message:ack");
      expect(ackEvent.payload.clientMessageId).toBe("client-msg-1");
      expect(ackEvent.payload.serverMessageId).toBe("msg-1");

      const conn2Calls = (conn2.ws.send as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(conn2Calls.length).toBeGreaterThanOrEqual(1);
      const newMsgEvent = JSON.parse(conn2Calls[0]?.[0] as string);
      expect(newMsgEvent.type).toBe("message:new");
      expect(newMsgEvent.payload.content).toBe("Hello!");
      expect(newMsgEvent.payload.assignedTo).toBe("user-1");
    });

    it("passes conversation data from validation to sendMessage", async () => {
      mockValidateSendAuthorization.mockResolvedValue(convData);
      const convId = "550e8400-e29b-41d4-a716-446655440000";
      const savedMessage = {
        id: "msg-1",
        conversationId: convId,
        senderId: "user-1",
        content: "Hello!",
        type: "text",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      };
      mockSendMessage.mockResolvedValue(savedMessage);

      await handler(
        conn,
        JSON.stringify({
          type: "message:send",
          payload: {
            conversationId: convId,
            content: "Hello!",
            clientMessageId: "client-msg-pass",
          },
        }),
      );

      expect(mockSendMessage).toHaveBeenCalledWith(
        { conversationId: convId, senderId: "user-1", content: "Hello!" },
        convData,
      );
    });

    it("sends error for invalid payload", async () => {
      await handler(
        conn,
        JSON.stringify({
          type: "message:send",
          payload: { conversationId: "bad", content: "" },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("VALIDATION_ERROR");
    });

    it("sends FORBIDDEN error when staff is not assigned to conversation", async () => {
      mockValidateSendAuthorization.mockRejectedValue(
        new NotAssignedToConversationError("conv-1", "user-1"),
      );

      const convId = "550e8400-e29b-41d4-a716-446655440000";

      await handler(
        conn,
        JSON.stringify({
          type: "message:send",
          payload: {
            conversationId: convId,
            content: "Hello!",
            clientMessageId: "client-msg-2",
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("FORBIDDEN");
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("sends CONVERSATION_NOT_ACTIVE when conversation is closed", async () => {
      mockValidateSendAuthorization.mockResolvedValue(convData);
      mockSendMessage.mockRejectedValue(
        new ConversationNotActiveError(
          "550e8400-e29b-41d4-a716-446655440000",
          "closed",
        ),
      );

      const convId = "550e8400-e29b-41d4-a716-446655440000";

      await handler(
        conn,
        JSON.stringify({
          type: "message:send",
          payload: {
            conversationId: convId,
            content: "Hello!",
            clientMessageId: "client-msg-closed",
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("CONVERSATION_NOT_ACTIVE");
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it("calls validateSendAuthorization before sendMessage", async () => {
      mockValidateSendAuthorization.mockResolvedValue(convData);
      const convId = "550e8400-e29b-41d4-a716-446655440000";
      const savedMessage = {
        id: "msg-1",
        conversationId: convId,
        senderId: "user-1",
        content: "Hello!",
        type: "text",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      };
      mockSendMessage.mockResolvedValue(savedMessage);

      await handler(
        conn,
        JSON.stringify({
          type: "message:send",
          payload: {
            conversationId: convId,
            content: "Hello!",
            clientMessageId: "client-msg-3",
          },
        }),
      );

      expect(mockValidateSendAuthorization).toHaveBeenCalledWith(
        convId,
        "user-1",
        "operator",
      );
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe("typing:start", () => {
    it("broadcasts typing:start to other room participants", async () => {
      mockIsParticipant.mockResolvedValue(true);
      const convId = "550e8400-e29b-41d4-a716-446655440000";

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: { conversationId: convId },
        }),
      );

      const conn2 = createMockConnection({
        id: "conn-2",
        userId: "user-2",
        userName: null,
        role: "visitor" as const,
      });
      roomManager.join(convId, conn2);

      vi.clearAllMocks();

      await handler(
        conn,
        JSON.stringify({
          type: "typing:start",
          payload: { conversationId: convId },
        }),
      );

      expect(conn.ws.send).not.toHaveBeenCalled();

      const conn2Calls = (conn2.ws.send as ReturnType<typeof vi.fn>).mock.calls;
      expect(conn2Calls).toHaveLength(1);
      const typingStartArg = conn2Calls[0]?.[0];
      expect(typeof typingStartArg).toBe("string");
      const event = JSON.parse(typingStartArg as string);
      expect(event.type).toBe("typing:start");
      expect(event.payload.conversationId).toBe(convId);
      expect(event.payload.userId).toBe("user-1");
      expect(event.payload.userName).toBe("Test User");
      expect(event.payload.senderRole).toBe("operator");
    });

    it("does not broadcast when sender is not in the room", async () => {
      const convId = "550e8400-e29b-41d4-a716-446655440000";

      await handler(
        conn,
        JSON.stringify({
          type: "typing:start",
          payload: { conversationId: convId },
        }),
      );

      expect(conn.ws.send).not.toHaveBeenCalled();
    });
  });

  describe("typing:stop", () => {
    it("broadcasts typing:stop to other room participants", async () => {
      mockIsParticipant.mockResolvedValue(true);
      const convId = "550e8400-e29b-41d4-a716-446655440000";

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: { conversationId: convId },
        }),
      );

      const conn2 = createMockConnection({
        id: "conn-2",
        userId: "user-2",
        userName: null,
        role: "visitor" as const,
      });
      roomManager.join(convId, conn2);

      vi.clearAllMocks();

      await handler(
        conn,
        JSON.stringify({
          type: "typing:stop",
          payload: { conversationId: convId },
        }),
      );

      expect(conn.ws.send).not.toHaveBeenCalled();

      const conn2Calls = (conn2.ws.send as ReturnType<typeof vi.fn>).mock.calls;
      expect(conn2Calls).toHaveLength(1);
      const typingStopArg = conn2Calls[0]?.[0];
      expect(typeof typingStopArg).toBe("string");
      const event = JSON.parse(typingStopArg as string);
      expect(event.type).toBe("typing:stop");
      expect(event.payload.conversationId).toBe(convId);
      expect(event.payload.userId).toBe("user-1");
    });
  });

  describe("ping", () => {
    it("responds with pong", async () => {
      await handler(conn, JSON.stringify({ type: "ping" }));

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("pong");
    });
  });

  describe("message:edit", () => {
    const convId = "550e8400-e29b-41d4-a716-446655440000";
    const msgId = "660e8400-e29b-41d4-a716-446655440000";

    it("broadcasts message:edited to all room participants", async () => {
      mockIsParticipant.mockResolvedValue(true);

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: { conversationId: convId },
        }),
      );

      const conn2 = createMockConnection({
        id: "conn-2",
        userId: "user-2",
        role: "visitor" as const,
      });
      roomManager.join(convId, conn2);

      const updatedMessage = {
        id: msgId,
        conversationId: convId,
        senderId: "user-1",
        content: "Edited content",
        type: "text",
        editedAt: "2026-01-01T00:01:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:01:00Z",
        deletedAt: null,
      };
      mockEditMessage.mockResolvedValue(updatedMessage);

      vi.clearAllMocks();

      await handler(
        conn,
        JSON.stringify({
          type: "message:edit",
          payload: {
            conversationId: convId,
            messageId: msgId,
            content: "Edited content",
          },
        }),
      );

      // Both connections should receive message:edited (broadcast to all)
      const conn1Calls = (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls;
      const conn2Calls = (conn2.ws.send as ReturnType<typeof vi.fn>).mock.calls;

      expect(conn1Calls.length + conn2Calls.length).toBeGreaterThanOrEqual(2);

      const allEvents = [...conn1Calls, ...conn2Calls].map(([arg]) =>
        JSON.parse(arg as string),
      );
      const editedEvents = allEvents.filter((e) => e.type === "message:edited");
      expect(editedEvents).toHaveLength(2);
      expect(editedEvents[0].payload.messageId).toBe(msgId);
      expect(editedEvents[0].payload.content).toBe("Edited content");
    });

    it("sends FORBIDDEN error when user is not the message sender", async () => {
      mockEditMessage.mockRejectedValue(
        new NotMessageSenderError(msgId, "user-1"),
      );

      await handler(
        conn,
        JSON.stringify({
          type: "message:edit",
          payload: {
            conversationId: convId,
            messageId: msgId,
            content: "Edited",
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("FORBIDDEN");
    });

    it("sends MESSAGE_NOT_FOUND error for non-existent message", async () => {
      mockEditMessage.mockRejectedValue(
        new MessageNotFoundError(msgId),
      );

      await handler(
        conn,
        JSON.stringify({
          type: "message:edit",
          payload: {
            conversationId: convId,
            messageId: msgId,
            content: "Edited",
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("MESSAGE_NOT_FOUND");
    });

    it("sends EDIT_WINDOW_EXPIRED error when time window has passed", async () => {
      mockEditMessage.mockRejectedValue(
        new MessageEditWindowExpiredError(msgId, "2026-01-01T00:00:00.000Z", 15),
      );

      await handler(
        conn,
        JSON.stringify({
          type: "message:edit",
          payload: {
            conversationId: convId,
            messageId: msgId,
            content: "Too late",
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("EDIT_WINDOW_EXPIRED");
    });
  });

  describe("message:delete", () => {
    const convId = "550e8400-e29b-41d4-a716-446655440000";
    const msgId = "660e8400-e29b-41d4-a716-446655440000";

    it("broadcasts message:deleted to all room participants", async () => {
      mockIsParticipant.mockResolvedValue(true);

      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: { conversationId: convId },
        }),
      );

      const conn2 = createMockConnection({
        id: "conn-2",
        userId: "user-2",
        role: "visitor" as const,
      });
      roomManager.join(convId, conn2);

      const deletedMessage = {
        id: msgId,
        conversationId: convId,
        senderId: "user-1",
        content: "Hello",
        type: "text",
        editedAt: null,
        deletedAt: "2026-01-01T00:01:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:01:00Z",
      };
      mockDeleteMessage.mockResolvedValue(deletedMessage);

      vi.clearAllMocks();

      await handler(
        conn,
        JSON.stringify({
          type: "message:delete",
          payload: {
            conversationId: convId,
            messageId: msgId,
          },
        }),
      );

      const conn1Calls = (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls;
      const conn2Calls = (conn2.ws.send as ReturnType<typeof vi.fn>).mock.calls;

      expect(conn1Calls.length + conn2Calls.length).toBeGreaterThanOrEqual(2);

      const allEvents = [...conn1Calls, ...conn2Calls].map(([arg]) =>
        JSON.parse(arg as string),
      );
      const deletedEvents = allEvents.filter((e) => e.type === "message:deleted");
      expect(deletedEvents).toHaveLength(2);
      expect(deletedEvents[0].payload.messageId).toBe(msgId);
    });

    it("sends FORBIDDEN error when user is not the message sender", async () => {
      mockDeleteMessage.mockRejectedValue(
        new NotMessageSenderError(msgId, "user-1"),
      );

      await handler(
        conn,
        JSON.stringify({
          type: "message:delete",
          payload: {
            conversationId: convId,
            messageId: msgId,
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("FORBIDDEN");
    });

    it("sends MESSAGE_NOT_FOUND error for non-existent message", async () => {
      mockDeleteMessage.mockRejectedValue(
        new MessageNotFoundError(msgId),
      );

      await handler(
        conn,
        JSON.stringify({
          type: "message:delete",
          payload: {
            conversationId: convId,
            messageId: msgId,
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("MESSAGE_NOT_FOUND");
    });

    it("sends EDIT_WINDOW_EXPIRED error when time window has passed", async () => {
      mockDeleteMessage.mockRejectedValue(
        new MessageEditWindowExpiredError(msgId, "2026-01-01T00:00:00.000Z", 15),
      );

      await handler(
        conn,
        JSON.stringify({
          type: "message:delete",
          payload: {
            conversationId: convId,
            messageId: msgId,
          },
        }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("EDIT_WINDOW_EXPIRED");
    });
  });

  describe("message:send rate limiting", () => {
    const convId = "550e8400-e29b-41d4-a716-446655440000";

    function sendMsg(h: ReturnType<typeof createEventHandler>, c: WSConnection) {
      return h(
        c,
        JSON.stringify({
          type: "message:send",
          payload: {
            conversationId: convId,
            content: "Hello!",
            clientMessageId: crypto.randomUUID(),
          },
        }),
      );
    }

    it("rejects visitor message when rate limit exceeded", async () => {
      const limiter = createVisitorWsRateLimiter({ perSecond: 1, perMinute: 100, perHour: 100 });
      const rateLimitedHandler = createEventHandler(roomManager, { visitorRateLimiter: limiter });
      const visitorConn = createMockConnection({ role: "visitor" as const, userId: "visitor-1" });

      mockValidateSendAuthorization.mockResolvedValue({ status: "active", assignedTo: null, organizationId: "org-1" });
      mockSendMessage.mockResolvedValue({
        id: "msg-1", conversationId: convId, senderId: "visitor-1",
        content: "Hello!", type: "text", createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z", deletedAt: null,
      });

      await sendMsg(rateLimitedHandler, visitorConn);
      vi.clearAllMocks();

      await sendMsg(rateLimitedHandler, visitorConn);

      const sentData = JSON.parse(
        firstWsSendPayload(visitorConn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("RATE_LIMITED");
      expect(sentData.payload.retryAfter).toBeGreaterThan(0);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("allows operator messages regardless of visitor rate limit state", async () => {
      const limiter = createVisitorWsRateLimiter({ perSecond: 1, perMinute: 100, perHour: 100 });
      const rateLimitedHandler = createEventHandler(roomManager, { visitorRateLimiter: limiter });

      mockValidateSendAuthorization.mockResolvedValue({ status: "active", assignedTo: null, organizationId: "org-1" });
      mockSendMessage.mockResolvedValue({
        id: "msg-1", conversationId: convId, senderId: "user-1",
        content: "Hello!", type: "text", createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z", deletedAt: null,
      });

      const operatorConn = createMockConnection({ role: "operator" as const });

      await sendMsg(rateLimitedHandler, operatorConn);
      await sendMsg(rateLimitedHandler, operatorConn);
      await sendMsg(rateLimitedHandler, operatorConn);

      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });

    it("allows admin messages regardless of visitor rate limit state", async () => {
      const limiter = createVisitorWsRateLimiter({ perSecond: 1, perMinute: 100, perHour: 100 });
      const rateLimitedHandler = createEventHandler(roomManager, { visitorRateLimiter: limiter });

      mockValidateSendAuthorization.mockResolvedValue({ status: "active", assignedTo: null, organizationId: "org-1" });
      mockSendMessage.mockResolvedValue({
        id: "msg-1", conversationId: convId, senderId: "user-1",
        content: "Hello!", type: "text", createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z", deletedAt: null,
      });

      const adminConn = createMockConnection({ role: "admin" as const });

      await sendMsg(rateLimitedHandler, adminConn);
      await sendMsg(rateLimitedHandler, adminConn);

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    it("does not persist rate-limited message to the database", async () => {
      const limiter = createVisitorWsRateLimiter({ perSecond: 1, perMinute: 100, perHour: 100 });
      const rateLimitedHandler = createEventHandler(roomManager, { visitorRateLimiter: limiter });
      const visitorConn = createMockConnection({ role: "visitor" as const, userId: "visitor-1" });

      mockValidateSendAuthorization.mockResolvedValue({ status: "active", assignedTo: null, organizationId: "org-1" });
      mockSendMessage.mockResolvedValue({
        id: "msg-1", conversationId: convId, senderId: "visitor-1",
        content: "Hello!", type: "text", createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z", deletedAt: null,
      });

      await sendMsg(rateLimitedHandler, visitorConn);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      await sendMsg(rateLimitedHandler, visitorConn);

      expect(mockValidateSendAuthorization).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("invalid events", () => {
    it("sends error for invalid JSON", async () => {
      await handler(conn, "not json{{{");

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("PARSE_ERROR");
    });

    it("sends error for unknown event type", async () => {
      await handler(
        conn,
        JSON.stringify({ type: "unknown:event", payload: {} }),
      );

      const sentData = JSON.parse(
        firstWsSendPayload(conn.ws.send as ReturnType<typeof vi.fn>),
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("VALIDATION_ERROR");
    });
  });
});
