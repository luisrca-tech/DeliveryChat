import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemoryRoomManager } from "../room-manager.js";
import type { WSConnection } from "../room-manager.js";
import { createEventHandler } from "../chat.handlers.js";

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

  return {
    sendMessage: vi.fn(),
    isParticipant: vi.fn(),
    getMessagesSince: vi.fn(),
    validateSendAuthorization: vi.fn(),
    NotAssignedToConversationError,
    ConversationNotFoundError,
    ConversationNotActiveError,
  };
});

const {
  sendMessage,
  isParticipant,
  getMessagesSince,
  validateSendAuthorization,
  NotAssignedToConversationError,
  ConversationNotActiveError,
} = (await import("../chat.service.js")) as any;

const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>;
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
    it("persists message and broadcasts to room", async () => {
      mockIsParticipant.mockResolvedValue(true);
      const convId = "550e8400-e29b-41d4-a716-446655440000";

      // Join room first
      await handler(
        conn,
        JSON.stringify({
          type: "room:join",
          payload: { conversationId: convId },
        }),
      );

      // Add another connection to the room
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
      mockSendMessage.mockResolvedValue(savedMessage);

      vi.clearAllMocks();

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

      // Sender should receive message:ack
      const senderCalls = (conn.ws.send as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(senderCalls.length).toBeGreaterThanOrEqual(1);
      const ackArg = senderCalls[0]?.[0];
      expect(typeof ackArg).toBe("string");
      const ackEvent = JSON.parse(ackArg as string);
      expect(ackEvent.type).toBe("message:ack");
      expect(ackEvent.payload.clientMessageId).toBe("client-msg-1");
      expect(ackEvent.payload.serverMessageId).toBe("msg-1");

      // Other connection should receive message:new
      const conn2Calls = (conn2.ws.send as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(conn2Calls.length).toBeGreaterThanOrEqual(1);
      const newArg = conn2Calls[0]?.[0];
      expect(typeof newArg).toBe("string");
      const newMsgEvent = JSON.parse(newArg as string);
      expect(newMsgEvent.type).toBe("message:new");
      expect(newMsgEvent.payload.content).toBe("Hello!");
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
      mockValidateSendAuthorization.mockResolvedValue(undefined);
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
      mockValidateSendAuthorization.mockResolvedValue(undefined);
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
