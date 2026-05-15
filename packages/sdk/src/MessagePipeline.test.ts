import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "./EventEmitter.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import type { ChatMessage } from "./types/index.js";

vi.mock("./state.js", () => {
  const stateStore: Record<string, unknown> = {
    visitorId: "visitor-1",
    conversationId: null,
    conversationStatus: null,
    messages: [] as ChatMessage[],
    rateLimited: false,
    isOpen: false,
  };

  return {
    getState: vi.fn((key: string) => stateStore[key]),
    setState: vi.fn((key: string, value: unknown) => {
      const prev = stateStore[key];
      const next =
        typeof value === "function"
          ? (value as (p: unknown) => unknown)(prev)
          : value;
      stateStore[key] = next;
    }),
  };
});

vi.mock("./conversation.js", () => ({
  createConversation: vi.fn(),
}));

vi.mock("./conversation-persistence.js", () => ({
  saveConversationId: vi.fn(),
  saveLastClientMessageId: vi.fn(),
}));

import { MessagePipeline } from "./MessagePipeline.js";
import { getState, setState } from "./state.js";
import { createConversation } from "./conversation.js";
import {
  saveConversationId,
  saveLastClientMessageId,
} from "./conversation-persistence.js";

describe("MessagePipeline", () => {
  let pipeline: MessagePipeline;
  let emitter: EventEmitter<SdkEventMap>;
  let sendWS: ReturnType<typeof vi.fn<(event: object) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    setState("visitorId", "visitor-1");
    setState("conversationId", null);
    setState("conversationStatus", null);
    setState("messages", []);
    setState("rateLimited", false);
    setState("isOpen", false);

    emitter = new EventEmitter<SdkEventMap>();
    sendWS = vi.fn<(event: object) => void>();
    pipeline = new MessagePipeline({ sendWS, emitter });
  });

  afterEach(async () => {
    pipeline.clearAllPending();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  describe("send()", () => {
    it("creates an optimistic message and sends via WS when conversation exists", async () => {
      setState("conversationId", "conv-1");
      setState("conversationStatus", "active");

      const promise = pipeline.send("hello", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });

      expect(setState).toHaveBeenCalledWith("messages", expect.any(Function));
      const messages = getState("messages") as ChatMessage[];
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        content: "hello",
        senderRole: "visitor",
        senderId: "visitor-1",
        status: "pending",
      });

      expect(sendWS).toHaveBeenCalledWith({
        type: "message:send",
        payload: {
          conversationId: "conv-1",
          content: "hello",
          clientMessageId: messages[0]!.id,
        },
      });

      pipeline.processAck({
        clientMessageId: messages[0]!.id,
        serverMessageId: "server-1",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const result = await promise;
      expect(result.id).toBe("server-1");
      expect(result.status).toBe("sent");
    });

    it("creates a conversation on first message then sends", async () => {
      vi.mocked(createConversation).mockResolvedValueOnce({
        conversation: {
          id: "new-conv-1",
          organizationId: "org-1",
          applicationId: "app-1",
          type: "support",
          status: "pending",
          subject: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      });

      const promise = pipeline.send("first message", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(createConversation).toHaveBeenCalledWith(
        "http://localhost",
        "app-1",
        "visitor-1",
      );
      expect(setState).toHaveBeenCalledWith("conversationId", "new-conv-1");
      expect(setState).toHaveBeenCalledWith("conversationStatus", "pending");
      expect(saveConversationId).toHaveBeenCalledWith("app-1", "new-conv-1");

      expect(sendWS).toHaveBeenCalledWith({
        type: "room:join",
        payload: { conversationId: "new-conv-1" },
      });

      const messages = getState("messages") as ChatMessage[];
      const clientId = messages[0]!.id;

      expect(sendWS).toHaveBeenCalledWith({
        type: "message:send",
        payload: {
          conversationId: "new-conv-1",
          content: "first message",
          clientMessageId: clientId,
        },
      });

      pipeline.processAck({
        clientMessageId: clientId,
        serverMessageId: "server-1",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const result = await promise;
      expect(result.id).toBe("server-1");
    });

    it("rejects when conversation is closed", async () => {
      setState("conversationStatus", "closed");

      await expect(
        pipeline.send("hi", { appId: "app-1", apiBaseUrl: "http://localhost" }),
      ).rejects.toThrow("Conversation is closed");
    });

    it("rejects when rate limited", async () => {
      setState("rateLimited", true);

      await expect(
        pipeline.send("hi", { appId: "app-1", apiBaseUrl: "http://localhost" }),
      ).rejects.toThrow("Rate limited");
    });

    it("rejects when visitorId is not set", async () => {
      setState("visitorId", null);

      await expect(
        pipeline.send("hi", { appId: "app-1", apiBaseUrl: "http://localhost" }),
      ).rejects.toThrow("Visitor not initialized");
    });

    it("marks message as failed when conversation creation fails", async () => {
      vi.mocked(createConversation).mockRejectedValueOnce(
        new Error("Network error"),
      );

      await expect(
        pipeline.send("hi", { appId: "app-1", apiBaseUrl: "http://localhost" }),
      ).rejects.toThrow("Failed to create conversation");

      const messages = getState("messages") as ChatMessage[];
      expect(messages[0]!.status).toBe("failed");
    });

    it("times out after 15 seconds", async () => {
      setState("conversationId", "conv-1");

      const promise = pipeline.send("hello", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });

      vi.advanceTimersByTime(15_001);

      await expect(promise).rejects.toThrow("Message send timed out");
    });

    it("handles concurrent sends independently", async () => {
      setState("conversationId", "conv-1");

      const p1 = pipeline.send("msg1", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });
      const p2 = pipeline.send("msg2", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });

      const messages = getState("messages") as ChatMessage[];
      expect(messages).toHaveLength(2);

      pipeline.processAck({
        clientMessageId: messages[1]!.id,
        serverMessageId: "server-2",
        createdAt: "2026-01-01T00:00:01Z",
      });
      pipeline.processAck({
        clientMessageId: messages[0]!.id,
        serverMessageId: "server-1",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.id).toBe("server-1");
      expect(r2.id).toBe("server-2");
    });

    it("saves lastClientMessageId for persistence", async () => {
      setState("conversationId", "conv-1");

      const promise = pipeline.send("hello", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });
      promise.catch(() => {});

      expect(saveLastClientMessageId).toHaveBeenCalledWith(
        "app-1",
        expect.any(String),
      );
    });
  });

  describe("processAck()", () => {
    it("emits message:sent with the ACK'd message", async () => {
      setState("conversationId", "conv-1");
      const sentListener = vi.fn();
      emitter.on("message:sent", sentListener);

      pipeline.send("hello", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });

      const messages = getState("messages") as ChatMessage[];
      const clientId = messages[0]!.id;

      pipeline.processAck({
        clientMessageId: clientId,
        serverMessageId: "server-1",
        createdAt: "2026-01-01T00:00:00Z",
      });

      expect(sentListener).toHaveBeenCalledOnce();
      expect(sentListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "server-1",
          status: "sent",
          content: "hello",
        }),
      );
    });
  });

  describe("processIncoming()", () => {
    it("emits message:received for operator messages", () => {
      const receivedListener = vi.fn();
      emitter.on("message:received", receivedListener);

      const msg: ChatMessage = {
        id: "msg-1",
        content: "Hi there",
        type: "text",
        senderRole: "operator",
        senderId: "op-1",
        status: "sent",
        createdAt: "2026-01-01T00:00:00Z",
      };

      pipeline.processIncoming(msg);

      expect(receivedListener).toHaveBeenCalledWith(msg);
    });

    it("does NOT emit message:received for visitor's own messages", () => {
      const receivedListener = vi.fn();
      emitter.on("message:received", receivedListener);

      const msg: ChatMessage = {
        id: "msg-1",
        content: "hello",
        type: "text",
        senderRole: "visitor",
        senderId: "visitor-1",
        status: "sent",
        createdAt: "2026-01-01T00:00:00Z",
      };

      pipeline.processIncoming(msg);

      expect(receivedListener).not.toHaveBeenCalled();
    });
  });

  describe("clearAllPending()", () => {
    it("rejects all pending promises", async () => {
      setState("conversationId", "conv-1");

      const p1 = pipeline.send("msg1", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });
      const p2 = pipeline.send("msg2", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });

      pipeline.clearAllPending();

      await expect(p1).rejects.toThrow("SDK destroyed");
      await expect(p2).rejects.toThrow("SDK destroyed");
    });
  });

  describe("rejectPending()", () => {
    it("rejects a specific pending promise", async () => {
      setState("conversationId", "conv-1");

      const promise = pipeline.send("hello", {
        appId: "app-1",
        apiBaseUrl: "http://localhost",
      });

      const messages = getState("messages") as ChatMessage[];
      pipeline.rejectPending(messages[0]!.id, new Error("custom error"));

      await expect(promise).rejects.toThrow("custom error");
    });
  });
});
