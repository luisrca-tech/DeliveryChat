import { describe, expect, it, vi, beforeEach } from "vitest";
import { MessageRouter } from "./MessageRouter.js";
import { getState, setState } from "./state.js";

vi.mock("./conversation-persistence.js", () => ({
  clearStaleConversationPersistence: vi.fn(),
}));

import { clearStaleConversationPersistence } from "./conversation-persistence.js";

describe("MessageRouter", () => {
  let router: MessageRouter;
  let mockMarkServerError: ReturnType<typeof vi.fn<(code: string) => void>>;

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
    router = new MessageRouter({ markServerError: mockMarkServerError });
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

    it("routes message:ack to update message id and status", () => {
      setState("messages", [
        { id: "client-1", content: "hi", type: "text", senderRole: "visitor", senderId: "v1", status: "pending", createdAt: "2026-01-01T00:00:00Z" },
      ]);

      router.handle({
        type: "message:ack",
        payload: {
          clientMessageId: "client-1",
          serverMessageId: "server-1",
          createdAt: "2026-01-01T00:00:01Z",
        },
      });

      const msgs = getState("messages");
      expect(msgs[0]!.id).toBe("server-1");
      expect(msgs[0]!.status).toBe("sent");
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
      setState("typingUser", { userId: "op-1", userName: "Alice", senderRole: "operator" });

      router.handle({
        type: "typing:stop",
        payload: { conversationId: "conv-1", userId: "op-1" },
      });

      expect(getState("typingUser")).toBeNull();
    });

    it("routes message:edited to update message content", () => {
      setState("conversationId", "conv-1");
      setState("messages", [
        { id: "msg-1", content: "original", type: "text", senderRole: "admin", senderId: "a1", status: "sent", createdAt: "2026-01-01T00:00:00Z" },
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
        { id: "msg-1", content: "bye", type: "text", senderRole: "admin", senderId: "a1", status: "sent", createdAt: "2026-01-01T00:00:00Z" },
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
        { id: "msg-1", content: "first", type: "text", senderRole: "visitor", senderId: "v1", status: "sent", createdAt: "2026-01-01T00:00:00Z" },
      ]);

      router.handle({
        type: "messages:sync",
        payload: {
          conversationId: "conv-1",
          messages: [
            { id: "msg-1", content: "first", senderId: "v1", senderRole: "visitor", createdAt: "2026-01-01T00:00:00Z" },
            { id: "msg-2", content: "second", senderId: "op-1", senderRole: "operator", createdAt: "2026-01-01T00:00:01Z" },
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

  describe("pending message resolution", () => {
    it("resolves a tracked pending message on message:ack", async () => {
      setState("messages", [
        { id: "client-1", content: "hi", type: "text", senderRole: "visitor", senderId: "v1", status: "pending", createdAt: "2026-01-01T00:00:00Z" },
      ]);

      const promise = router.trackPendingMessage("client-1");

      router.handle({
        type: "message:ack",
        payload: {
          clientMessageId: "client-1",
          serverMessageId: "server-1",
          createdAt: "2026-01-01T00:00:01Z",
        },
      });

      const result = await promise;
      expect(result.id).toBe("server-1");
      expect(result.status).toBe("sent");
    });

    it("rejects pending messages on RATE_LIMITED error", async () => {
      setState("messages", [
        { id: "client-1", content: "hi", type: "text", senderRole: "visitor", senderId: "v1", status: "pending", createdAt: "2026-01-01T00:00:00Z" },
      ]);

      const promise = router.trackPendingMessage("client-1");

      router.handle({
        type: "error",
        payload: { code: "RATE_LIMITED", message: "Rate limit exceeded", retryAfter: 3 },
      });

      await expect(promise).rejects.toThrow("Rate limited");
    });

    it("rejects pending messages on CONVERSATION_NOT_ACTIVE error", async () => {
      setState("messages", [
        { id: "client-1", content: "hi", type: "text", senderRole: "visitor", senderId: "v1", status: "pending", createdAt: "2026-01-01T00:00:00Z" },
      ]);

      const promise = router.trackPendingMessage("client-1");

      router.handle({
        type: "error",
        payload: { code: "CONVERSATION_NOT_ACTIVE", message: "Conversation is not active" },
      });

      await expect(promise).rejects.toThrow("CONVERSATION_NOT_ACTIVE");
    });

    it("times out if no ACK arrives within the timeout window", async () => {
      const promise = router.trackPendingMessage("client-1");

      vi.advanceTimersByTime(15_000);

      await expect(promise).rejects.toThrow("timed out");
    });

    it("clearAllPending rejects all tracked promises", async () => {
      const p1 = router.trackPendingMessage("a");
      const p2 = router.trackPendingMessage("b");

      router.clearAllPending();

      await expect(p1).rejects.toThrow("destroyed");
      await expect(p2).rejects.toThrow("destroyed");
    });
  });

  describe("rate limit handling", () => {
    it("sets rateLimited state and clears after retryAfter", async () => {
      router.handle({
        type: "error",
        payload: { code: "RATE_LIMITED", message: "Rate limit exceeded", retryAfter: 3 },
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
