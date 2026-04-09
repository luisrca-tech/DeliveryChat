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

  return {
    sendMessage: vi.fn(),
    isParticipant: vi.fn(),
    getMessagesSince: vi.fn(),
    validateSendAuthorization: vi.fn(),
    NotAssignedToConversationError,
  };
});

const { sendMessage, isParticipant, getMessagesSince, validateSendAuthorization, NotAssignedToConversationError } = await import(
  "../chat.service.js"
) as any;

const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>;
const mockIsParticipant = isParticipant as ReturnType<typeof vi.fn>;
const mockGetMessagesSince = getMessagesSince as ReturnType<typeof vi.fn>;
const mockValidateSendAuthorization = validateSendAuthorization as ReturnType<typeof vi.fn>;

function createMockConnection(
  overrides: Partial<WSConnection> = {},
): WSConnection {
  return {
    id: "conn-1",
    userId: "user-1",
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
        (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
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
        (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
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
      const ackEvent = JSON.parse(senderCalls[0][0]);
      expect(ackEvent.type).toBe("message:ack");
      expect(ackEvent.payload.clientMessageId).toBe("client-msg-1");
      expect(ackEvent.payload.serverMessageId).toBe("msg-1");

      // Other connection should receive message:new
      const conn2Calls = (conn2.ws.send as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(conn2Calls.length).toBeGreaterThanOrEqual(1);
      const newMsgEvent = JSON.parse(conn2Calls[0][0]);
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
        (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
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
        (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("FORBIDDEN");
      expect(mockSendMessage).not.toHaveBeenCalled();
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

  describe("ping", () => {
    it("responds with pong", async () => {
      await handler(conn, JSON.stringify({ type: "ping" }));

      const sentData = JSON.parse(
        (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
      );
      expect(sentData.type).toBe("pong");
    });
  });

  describe("invalid events", () => {
    it("sends error for invalid JSON", async () => {
      await handler(conn, "not json{{{");

      const sentData = JSON.parse(
        (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
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
        (conn.ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0],
      );
      expect(sentData.type).toBe("error");
      expect(sentData.payload.code).toBe("VALIDATION_ERROR");
    });
  });
});
