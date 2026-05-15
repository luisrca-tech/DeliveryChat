import { describe, expect, it, vi, beforeEach } from "vitest";
import { MessageRouter } from "./MessageRouter.js";
import { getState, setState } from "./state.js";
import type { MessagePipeline } from "./MessagePipeline.js";

vi.mock("./conversation-persistence.js", () => ({
  clearStaleConversationPersistence: vi.fn(),
}));

import { clearStaleConversationPersistence } from "./conversation-persistence.js";

function createMockPipeline(): MessagePipeline & {
  processAck: ReturnType<typeof vi.fn>;
  processIncoming: ReturnType<typeof vi.fn>;
  rejectPending: ReturnType<typeof vi.fn>;
  clearAllPending: ReturnType<typeof vi.fn>;
} {
  return {
    processAck: vi.fn(),
    processIncoming: vi.fn(),
    rejectPending: vi.fn(),
    clearAllPending: vi.fn(),
    send: vi.fn(),
  } as unknown as MessagePipeline & {
    processAck: ReturnType<typeof vi.fn>;
    processIncoming: ReturnType<typeof vi.fn>;
    rejectPending: ReturnType<typeof vi.fn>;
    clearAllPending: ReturnType<typeof vi.fn>;
  };
}

describe("MessageRouter", () => {
  let router: MessageRouter;
  let mockMarkServerError: ReturnType<typeof vi.fn<(code: string) => void>>;
  let mockPipeline: ReturnType<typeof createMockPipeline>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setState("connectionStatus", "disconnected");
    setState("connectionError", null);
    setState("conversationId", null);
    setState("conversationStatus", null);
    setState("messages", []);
    setState("typingUser", null);
    setState("unreadCount", 0);
    setState("isOpen", false);
    setState("rateLimited", false);
    setState("rateLimitRetryAfter", null);

    mockMarkServerError = vi.fn<(code: string) => void>();
    mockPipeline = createMockPipeline();
    router = new MessageRouter({
      markServerError: mockMarkServerError,
      pipeline: mockPipeline,
    });
  });

  describe("dispatch by event type", () => {
    it("routes message:new to add a message to state", () => {
      setState("conversationId", "conv-1");

      router.handle({
        type: "message:new",
        payload: {
          id: "msg-1",
          conversationId: "conv-1",
          senderId: "op-1",
          senderRole: "operator",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      expect(getState("messages")).toHaveLength(1);
      expect(getState("messages")[0]!.id).toBe("msg-1");
    });

    it("routes message:ack to pipeline.processAck", () => {
      router.handle({
        type: "message:ack",
        payload: {
          clientMessageId: "client-1",
          serverMessageId: "server-1",
          createdAt: "2026-01-01T00:00:01Z",
        },
      });

      expect(mockPipeline.processAck).toHaveBeenCalledWith({
        clientMessageId: "client-1",
        serverMessageId: "server-1",
        createdAt: "2026-01-01T00:00:01Z",
      });
    });

    it("routes conversation:accepted to update status", () => {
      setState("conversationId", "conv-1");

      router.handle({
        type: "conversation:accepted",
        payload: { conversationId: "conv-1" },
      });

      expect(getState("conversationStatus")).toBe("active");
    });

    it("routes conversation:resolved to update status", () => {
      setState("conversationId", "conv-1");

      router.handle({
        type: "conversation:resolved",
        payload: { conversationId: "conv-1" },
      });

      expect(getState("conversationStatus")).toBe("closed");
    });

    it("routes conversation:released to update status", () => {
      setState("conversationId", "conv-1");

      router.handle({
        type: "conversation:released",
        payload: { conversationId: "conv-1" },
      });

      expect(getState("conversationStatus")).toBe("pending");
    });

    it("routes typing:start to set typingUser", () => {
      router.handle({
        type: "typing:start",
        payload: {
          conversationId: "conv-1",
          userId: "op-1",
          userName: "Alice",
          senderRole: "operator",
        },
      });

      expect(getState("typingUser")).toEqual({
        userId: "op-1",
        userName: "Alice",
        senderRole: "operator",
      });
    });

    it("routes typing:stop to clear typingUser", () => {
      setState("typingUser", {
        userId: "op-1",
        userName: "Alice",
        senderRole: "operator",
      });

      router.handle({
        type: "typing:stop",
        payload: { conversationId: "conv-1", userId: "op-1" },
      });

      expect(getState("typingUser")).toBeNull();
    });

    it("routes message:edited to update message content", () => {
      setState("conversationId", "conv-1");
      setState("messages", [
        {
          id: "msg-1",
          content: "original",
          type: "text",
          senderRole: "admin",
          senderId: "a1",
          status: "sent",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]);

      router.handle({
        type: "message:edited",
        payload: {
          conversationId: "conv-1",
          messageId: "msg-1",
          content: "edited",
          editedAt: "2026-01-01T00:01:00Z",
          senderId: "a1",
        },
      });

      expect(getState("messages")[0]!.content).toBe("edited");
    });

    it("routes message:deleted to mark message as deleted", () => {
      setState("conversationId", "conv-1");
      setState("messages", [
        {
          id: "msg-1",
          content: "bye",
          type: "text",
          senderRole: "admin",
          senderId: "a1",
          status: "sent",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]);

      router.handle({
        type: "message:deleted",
        payload: {
          conversationId: "conv-1",
          messageId: "msg-1",
          senderId: "a1",
        },
      });

      expect(getState("messages")[0]!.isDeleted).toBe(true);
      expect(getState("messages")[0]!.content).toBe("");
    });

    it("routes messages:sync to merge missing messages", () => {
      setState("conversationId", "conv-1");
      setState("messages", [
        {
          id: "msg-1",
          content: "first",
          type: "text",
          senderRole: "visitor",
          senderId: "v1",
          status: "sent",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]);

      router.handle({
        type: "messages:sync",
        payload: {
          conversationId: "conv-1",
          messages: [
            {
              id: "msg-1",
              content: "first",
              senderId: "v1",
              senderRole: "visitor",
              createdAt: "2026-01-01T00:00:00Z",
            },
            {
              id: "msg-2",
              content: "second",
              senderId: "op-1",
              senderRole: "operator",
              createdAt: "2026-01-01T00:00:01Z",
            },
          ],
        },
      });

      expect(getState("messages")).toHaveLength(2);
    });

    it("silently ignores pong events", () => {
      router.handle({ type: "pong" });
      // No error thrown, no state changes
    });

    it("ignores unknown event types", () => {
      router.handle({ type: "unknown:thing", payload: {} });
      // No error thrown
    });
  });

  describe("pipeline delegation", () => {
    it("delegates message:ack to pipeline.processAck", () => {
      router.handle({
        type: "message:ack",
        payload: {
          clientMessageId: "client-1",
          serverMessageId: "server-1",
          createdAt: "2026-01-01T00:00:01Z",
        },
      });

      expect(mockPipeline.processAck).toHaveBeenCalledOnce();
    });

    it("calls pipeline.processIncoming for non-duplicate messages", () => {
      setState("conversationId", "conv-1");

      router.handle({
        type: "message:new",
        payload: {
          id: "msg-1",
          conversationId: "conv-1",
          senderId: "op-1",
          senderRole: "operator",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      expect(mockPipeline.processIncoming).toHaveBeenCalledWith(
        expect.objectContaining({ id: "msg-1", content: "Hello" }),
      );
    });

    it("does NOT call pipeline.processIncoming for duplicate messages", () => {
      setState("conversationId", "conv-1");
      setState("messages", [
        {
          id: "msg-1",
          content: "Hello",
          type: "text",
          senderRole: "operator",
          senderId: "op-1",
          status: "sent",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]);

      router.handle({
        type: "message:new",
        payload: {
          id: "msg-1",
          conversationId: "conv-1",
          senderId: "op-1",
          senderRole: "operator",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      expect(mockPipeline.processIncoming).not.toHaveBeenCalled();
    });

    it("rejects pending via pipeline on RATE_LIMITED error", () => {
      setState("messages", [
        {
          id: "client-1",
          content: "hi",
          type: "text",
          senderRole: "visitor",
          senderId: "v1",
          status: "pending",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]);

      router.handle({
        type: "error",
        payload: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded",
          retryAfter: 3,
        },
      });

      expect(mockPipeline.rejectPending).toHaveBeenCalledWith(
        "client-1",
        expect.objectContaining({
          message: expect.stringContaining("Rate limited"),
        }),
      );
    });

    it("rejects pending via pipeline on CONVERSATION_NOT_ACTIVE error", () => {
      setState("messages", [
        {
          id: "client-1",
          content: "hi",
          type: "text",
          senderRole: "visitor",
          senderId: "v1",
          status: "pending",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]);

      router.handle({
        type: "error",
        payload: {
          code: "CONVERSATION_NOT_ACTIVE",
          message: "Conversation is not active",
        },
      });

      expect(mockPipeline.rejectPending).toHaveBeenCalledWith(
        "client-1",
        expect.objectContaining({
          message: expect.stringContaining("CONVERSATION_NOT_ACTIVE"),
        }),
      );
    });
  });

  describe("rate limit handling", () => {
    it("sets rateLimited state and clears after retryAfter", async () => {
      router.handle({
        type: "error",
        payload: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded",
          retryAfter: 3,
        },
      });

      expect(getState("rateLimited")).toBe(true);
      expect(getState("rateLimitRetryAfter")).toBe(3);

      await vi.advanceTimersByTimeAsync(3_000);

      expect(getState("rateLimited")).toBe(false);
      expect(getState("rateLimitRetryAfter")).toBeNull();
    });
  });

  describe("conversation error handling", () => {
    it("clears stale conversation persistence on CONVERSATION_NOT_FOUND", () => {
      router.handle({
        type: "error",
        payload: { code: "CONVERSATION_NOT_FOUND", message: "Not found" },
      });

      expect(clearStaleConversationPersistence).toHaveBeenCalled();
    });

    it("passes server error code to markServerError callback", () => {
      router.handle({
        type: "error",
        payload: { code: "UNAUTHORIZED", message: "Auth failed" },
      });

      expect(mockMarkServerError).toHaveBeenCalledWith("UNAUTHORIZED");
    });
  });

  describe("conversation isolation", () => {
    it("ignores message:new from a different conversation", () => {
      setState("conversationId", "conv-mine");

      router.handle({
        type: "message:new",
        payload: {
          id: "msg-1",
          conversationId: "conv-other",
          senderId: "op-1",
          senderRole: "operator",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      expect(getState("messages")).toHaveLength(0);
    });

    it("ignores conversation:accepted for a different conversation", () => {
      setState("conversationId", "conv-mine");
      setState("conversationStatus", "pending");

      router.handle({
        type: "conversation:accepted",
        payload: { conversationId: "conv-other" },
      });

      expect(getState("conversationStatus")).toBe("pending");
    });
  });

  describe("unread count", () => {
    it("increments unread count for non-visitor messages when widget is closed", () => {
      setState("conversationId", "conv-1");
      setState("isOpen", false);

      router.handle({
        type: "message:new",
        payload: {
          id: "msg-1",
          conversationId: "conv-1",
          senderId: "op-1",
          senderRole: "operator",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      expect(getState("unreadCount")).toBe(1);
    });

    it("does not increment unread count for visitor's own messages", () => {
      setState("conversationId", "conv-1");
      setState("isOpen", false);

      router.handle({
        type: "message:new",
        payload: {
          id: "msg-1",
          conversationId: "conv-1",
          senderId: "v1",
          senderRole: "visitor",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      expect(getState("unreadCount")).toBe(0);
    });
  });
});
