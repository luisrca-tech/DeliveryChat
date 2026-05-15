import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetConversationMessages,
  mockMarkConversationAsRead,
  mockGetUnreadCount,
} = vi.hoisted(() => ({
  mockGetConversationMessages: vi.fn(),
  mockMarkConversationAsRead: vi.fn(),
  mockGetUnreadCount: vi.fn(),
}));

vi.mock("./ws.js", () => ({
  connectWS: vi.fn(),
  disconnectWS: vi.fn(),
  sendWSMessage: vi.fn(),
  getMessageRouter: vi.fn().mockReturnValue({ cleanup: vi.fn() }),
  getMessagePipeline: vi.fn().mockReturnValue({
    send: vi.fn(),
    processAck: vi.fn(),
    processIncoming: vi.fn(),
    rejectPending: vi.fn(),
    clearAllPending: vi.fn(),
  }),
  getEmitter: vi.fn().mockReturnValue(null),
}));

vi.mock("./conversation.js", () => ({
  createConversation: vi.fn(),
  getConversationMessages: mockGetConversationMessages,
  markConversationAsRead: mockMarkConversationAsRead,
  getUnreadCount: mockGetUnreadCount,
}));

vi.mock("./conversation-persistence.js", () => ({
  setActiveAppIdForPersistence: vi.fn(),
  loadPersistedConversationId: vi.fn().mockReturnValue(null),
  removeAllConversationKeysForApp: vi.fn(),
  saveConversationId: vi.fn(),
  saveLastClientMessageId: vi.fn(),
}));

vi.mock("./visitor.js", () => ({
  getOrCreateVisitorId: vi.fn(() => "visitor-123"),
}));

vi.mock("./config.js", () => ({
  getApiBaseUrl: vi.fn(() => "https://api.test.com"),
  setApiBaseUrl: vi.fn(),
}));

vi.mock("./api.js", () => ({
  postIdentify: vi.fn(),
}));

import { getSdkApi, resetSdkApi } from "./SdkApi.js";
import { getState, setState } from "./state.js";
import {
  connectWS,
  disconnectWS,
  sendWSMessage,
  getMessagePipeline,
} from "./ws.js";
import {
  loadPersistedConversationId,
  removeAllConversationKeysForApp,
  setActiveAppIdForPersistence,
} from "./conversation-persistence.js";

describe("SdkApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSdkApi();
    setState("messages", []);
    setState("conversationId", null);
    setState("conversationStatus", null);
    setState("visitorId", null);
    setState("unreadCount", 0);
    setState("typingUser", null);
    setState("isOpen", false);
    setState("connectionStatus", "disconnected");
    setState("editingMessageId", null);
  });

  // ── Public API: pre-init guards ──

  describe("before init", () => {
    it("open() throws a clear error", () => {
      expect(() => getSdkApi().open()).toThrow(
        "[DeliveryChat] SDK not initialized. Call init() first.",
      );
    });

    it("close() throws a clear error", () => {
      expect(() => getSdkApi().close()).toThrow(
        "[DeliveryChat] SDK not initialized. Call init() first.",
      );
    });

    it("toggle() throws a clear error", () => {
      expect(() => getSdkApi().toggle()).toThrow(
        "[DeliveryChat] SDK not initialized. Call init() first.",
      );
    });

    it("hideWidget() throws a clear error", () => {
      expect(() => getSdkApi().hideWidget()).toThrow(
        "[DeliveryChat] SDK not initialized. Call init() first.",
      );
    });

    it("showWidget() throws a clear error", () => {
      expect(() => getSdkApi().showWidget()).toThrow(
        "[DeliveryChat] SDK not initialized. Call init() first.",
      );
    });

    it("sendMessage() throws before init", async () => {
      await expect(getSdkApi().sendMessage("hello")).rejects.toThrow(
        "SDK not initialized",
      );
    });

    it("getConversation() throws before init", () => {
      expect(() => getSdkApi().getConversation()).toThrow(
        "SDK not initialized",
      );
    });
  });

  // ── Public API: after init ──

  describe("after markInitialized", () => {
    it("open() sets isOpen and triggers openChat logic", () => {
      const api = getSdkApi();
      api.markInitialized({ appId: "app-1" });

      api.open();

      expect(getState("isOpen")).toBe(true);
    });

    it("close() sets isOpen to false", () => {
      const api = getSdkApi();
      api.markInitialized();
      setState("isOpen", true);

      api.close();

      expect(getState("isOpen")).toBe(false);
    });

    it("toggle() opens when closed", () => {
      const api = getSdkApi();
      api.markInitialized();
      setState("isOpen", false);

      api.toggle();

      expect(getState("isOpen")).toBe(true);
    });

    it("toggle() closes when open", () => {
      const api = getSdkApi();
      api.markInitialized();
      setState("isOpen", true);

      api.toggle();

      expect(getState("isOpen")).toBe(false);
    });

    it("hideWidget() hides the launcher", () => {
      const api = getSdkApi();
      api.markInitialized();
      api.hideWidget();
      expect(getState("widgetVisible")).toBe(false);
    });

    it("showWidget() shows the launcher", () => {
      const api = getSdkApi();
      api.markInitialized();
      api.showWidget();
      expect(getState("widgetVisible")).toBe(true);
    });
  });

  // ── Events ──

  describe("on/off event methods", () => {
    it("on() registers a listener", () => {
      const api = getSdkApi();
      const listener = vi.fn();
      api.on("ready", listener);
      api.emitter.emit("ready");
      expect(listener).toHaveBeenCalledOnce();
    });

    it("off() removes a listener", () => {
      const api = getSdkApi();
      const listener = vi.fn();
      api.on("ready", listener);
      api.off("ready", listener);
      api.emitter.emit("ready");
      expect(listener).not.toHaveBeenCalled();
    });

    it("on() works before init", () => {
      const api = getSdkApi();
      const listener = vi.fn();
      api.on("message:received", listener);
      api.emitter.emit("message:received", {
        id: "1",
        content: "hello",
        type: "text",
        senderRole: "operator",
        senderId: "op1",
        status: "sent",
        createdAt: "2024-01-01",
      });
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── Headless mode ──

  describe("headless mode", () => {
    it("open/close/toggle/hideWidget/showWidget are no-ops when headless", () => {
      const api = getSdkApi();
      api.markInitialized({ headless: true });
      const prevOpen = getState("isOpen");

      api.open();
      api.close();
      api.toggle();
      api.hideWidget();
      api.showWidget();

      expect(getState("isOpen")).toBe(prevOpen);
    });

    it("sendMessage delegates to pipeline", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      api.markInitialized({ appId: "app-1" });

      const mockMsg = {
        id: "s1",
        content: "hello",
        type: "text" as const,
        senderRole: "visitor" as const,
        senderId: "v1",
        status: "sent" as const,
        createdAt: "2024-01-01",
      };
      vi.mocked(getMessagePipeline()!.send).mockResolvedValueOnce(mockMsg);

      const result = await api.sendMessage("hello");
      expect(result).toEqual(mockMsg);
    });

    it("getConversation returns null when no active conversation", () => {
      const api = getSdkApi();
      api.markInitialized();
      expect(api.getConversation()).toBeNull();
    });

    it("getConversation returns snapshot when conversation exists", () => {
      const api = getSdkApi();
      api.markInitialized();
      const messages = [
        {
          id: "m1",
          content: "hi",
          type: "text" as const,
          senderRole: "visitor" as const,
          senderId: "v1",
          status: "sent" as const,
          createdAt: "2024-01-01",
        },
      ];
      setState("conversationId", "conv-1");
      setState("conversationStatus", "active");
      setState("messages", messages);

      const result = api.getConversation();
      expect(result).toEqual({ id: "conv-1", status: "active", messages });
    });
  });

  // ── initChat (absorbed from chat-controller) ──

  describe("initChat", () => {
    it("sets visitorId and persistence on init", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });

      expect(getState("visitorId")).toBe("visitor-123");
      expect(setActiveAppIdForPersistence).toHaveBeenCalledWith("app-1");
    });

    it("restores conversation history when persisted conversationId exists", async () => {
      vi.mocked(loadPersistedConversationId).mockReturnValueOnce(
        "conv-persisted",
      );
      mockGetConversationMessages.mockResolvedValueOnce({
        messages: [
          {
            id: "msg-1",
            conversationId: "conv-persisted",
            senderId: "visitor-123",
            senderName: null,
            type: "text",
            content: "Hello",
            createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "msg-2",
            conversationId: "conv-persisted",
            senderId: "op-1",
            senderName: "Agent",
            type: "text",
            content: "Hi!",
            createdAt: "2026-01-01T00:01:00Z",
          },
        ],
        limit: 50,
        offset: 0,
      });

      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });

      expect(getState("conversationId")).toBe("conv-persisted");
      const messages = getState("messages");
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ id: "msg-1", senderRole: "visitor" });
      expect(messages[1]).toMatchObject({
        id: "msg-2",
        senderRole: "operator",
      });
    });

    it("connects WS when restoring a persisted conversation", async () => {
      vi.mocked(loadPersistedConversationId).mockReturnValueOnce("conv-1");
      mockGetConversationMessages.mockResolvedValueOnce({
        messages: [],
        limit: 50,
        offset: 0,
      });

      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });

      expect(connectWS).toHaveBeenCalledWith({
        apiBaseUrl: "https://api.test.com",
        appId: "app-1",
        visitorId: "visitor-123",
      });
    });

    it("does not fetch messages when no persisted conversationId", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });

      expect(mockGetConversationMessages).not.toHaveBeenCalled();
      expect(getState("messages")).toEqual([]);
    });

    it("clears persisted conversation on 404", async () => {
      vi.mocked(loadPersistedConversationId).mockReturnValueOnce(
        "conv-deleted",
      );
      mockGetConversationMessages.mockRejectedValueOnce(
        new Error("Failed to fetch messages (404)"),
      );

      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });

      expect(getState("conversationId")).toBeNull();
      expect(removeAllConversationKeysForApp).toHaveBeenCalledWith("app-1");
    });

    it("orders restored messages chronologically", async () => {
      vi.mocked(loadPersistedConversationId).mockReturnValueOnce("conv-order");
      mockGetConversationMessages.mockResolvedValueOnce({
        messages: [
          {
            id: "msg-new",
            conversationId: "conv-order",
            senderId: "op-1",
            senderName: "Agent",
            type: "text",
            content: "Second",
            createdAt: "2026-01-01T00:01:00Z",
          },
          {
            id: "msg-old",
            conversationId: "conv-order",
            senderId: "v-1",
            senderName: null,
            type: "text",
            content: "First",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        limit: 50,
        offset: 0,
      });

      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });

      const messages = getState("messages");
      expect(messages[0]!.id).toBe("msg-old");
      expect(messages[1]!.id).toBe("msg-new");
    });
  });

  // ── openChat (absorbed from chat-controller) ──

  describe("openChat", () => {
    it("resets unread count and connects WS lazily", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("connectionStatus", "disconnected");

      api.openChat();

      expect(getState("unreadCount")).toBe(0);
      expect(connectWS).toHaveBeenCalled();
    });

    it("marks conversation as read when one exists", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");
      mockMarkConversationAsRead.mockResolvedValueOnce(undefined);

      api.openChat();

      expect(mockMarkConversationAsRead).toHaveBeenCalledWith(
        "https://api.test.com",
        "app-1",
        "conv-1",
        "visitor-123",
      );
    });

    it("does nothing before initChat", () => {
      const api = getSdkApi();
      api.openChat();
      expect(connectWS).not.toHaveBeenCalled();
    });
  });

  // ── editMessage (absorbed from chat-controller) ──

  describe("editMessage", () => {
    it("updates message content optimistically and sends WS message", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");
      setState("messages", [
        {
          id: "m1",
          content: "old",
          type: "text",
          senderRole: "visitor",
          senderId: "v1",
          status: "sent",
          createdAt: "2024-01-01",
        },
      ]);

      api.editMessage("m1", "new content");

      const messages = getState("messages");
      expect(messages[0]!.content).toBe("new content");
      expect(messages[0]!.editedAt).toBeTruthy();
      expect(getState("editingMessageId")).toBeNull();
      expect(sendWSMessage).toHaveBeenCalledWith({
        type: "message:edit",
        payload: {
          conversationId: "conv-1",
          messageId: "m1",
          content: "new content",
        },
      });
    });

    it("does nothing without active conversation", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      api.editMessage("m1", "new");
      expect(sendWSMessage).not.toHaveBeenCalled();
    });
  });

  // ── deleteMessage (absorbed from chat-controller) ──

  describe("deleteMessage", () => {
    it("marks message as deleted optimistically and sends WS message", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");
      setState("messages", [
        {
          id: "m1",
          content: "hello",
          type: "text",
          senderRole: "visitor",
          senderId: "v1",
          status: "sent",
          createdAt: "2024-01-01",
        },
      ]);

      api.deleteMessage("m1");

      const messages = getState("messages");
      expect(messages[0]!.isDeleted).toBe(true);
      expect(messages[0]!.content).toBe("");
      expect(sendWSMessage).toHaveBeenCalledWith({
        type: "message:delete",
        payload: { conversationId: "conv-1", messageId: "m1" },
      });
    });
  });

  // ── notifyTypingStart/Stop (absorbed from chat-controller) ──

  describe("notifyTypingStart", () => {
    it("sends typing:start WS message", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");

      api.notifyTypingStart();

      expect(sendWSMessage).toHaveBeenCalledWith({
        type: "typing:start",
        payload: { conversationId: "conv-1" },
      });
    });

    it("throttles subsequent calls", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");

      api.notifyTypingStart();
      api.notifyTypingStart();

      expect(sendWSMessage).toHaveBeenCalledTimes(1);
    });

    it("does nothing without conversationId", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      api.notifyTypingStart();
      expect(sendWSMessage).not.toHaveBeenCalled();
    });
  });

  describe("notifyTypingStop", () => {
    it("sends typing:stop WS message", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");

      api.notifyTypingStop();

      expect(sendWSMessage).toHaveBeenCalledWith({
        type: "typing:stop",
        payload: { conversationId: "conv-1" },
      });
    });
  });

  // ── startNewChat (absorbed from chat-controller) ──

  describe("startNewChat", () => {
    it("resets conversation state and clears persistence", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");
      setState("conversationStatus", "closed");
      setState("messages", [
        {
          id: "m1",
          content: "hi",
          type: "text",
          senderRole: "visitor",
          senderId: "v1",
          status: "sent",
          createdAt: "2024-01-01",
        },
      ]);

      api.startNewChat();

      expect(getState("conversationId")).toBeNull();
      expect(getState("conversationStatus")).toBeNull();
      expect(getState("messages")).toEqual([]);
      expect(getState("typingUser")).toBeNull();
      expect(getState("unreadCount")).toBe(0);
      expect(removeAllConversationKeysForApp).toHaveBeenCalledWith("app-1");
    });

    it("does not disconnect WebSocket", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      api.startNewChat();
      expect(disconnectWS).not.toHaveBeenCalled();
    });
  });

  // ── connectEagerly (absorbed from chat-controller) ──

  describe("connectEagerly", () => {
    it("connects WS when disconnected", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("connectionStatus", "disconnected");

      api.connectEagerly();

      expect(connectWS).toHaveBeenCalledWith({
        apiBaseUrl: "https://api.test.com",
        appId: "app-1",
        visitorId: "visitor-123",
      });
    });

    it("does not connect when already connected", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("connectionStatus", "connected");
      vi.mocked(connectWS).mockClear();

      api.connectEagerly();

      expect(connectWS).not.toHaveBeenCalled();
    });
  });

  // ── destroyChat (absorbed from chat-controller) ──

  describe("destroyChat", () => {
    it("clears pipeline, disconnects WS, removes persistence, resets state", async () => {
      const api = getSdkApi();
      await api.initChat({ appId: "app-1" });
      setState("conversationId", "conv-1");
      setState("messages", [
        {
          id: "m1",
          content: "hi",
          type: "text",
          senderRole: "visitor",
          senderId: "v1",
          status: "sent",
          createdAt: "2024-01-01",
        },
      ]);

      api.destroyChat();

      expect(getMessagePipeline()?.clearAllPending).toHaveBeenCalled();
      expect(disconnectWS).toHaveBeenCalled();
      expect(removeAllConversationKeysForApp).toHaveBeenCalledWith("app-1");
      expect(setActiveAppIdForPersistence).toHaveBeenCalledWith(null);
      expect(getState("conversationId")).toBeNull();
      expect(getState("conversationStatus")).toBeNull();
      expect(getState("messages")).toEqual([]);
      expect(getState("unreadCount")).toBe(0);
    });
  });

  // ── Full lifecycle ──

  describe("full init→connect→send→destroy lifecycle", () => {
    it("completes a full lifecycle without errors", async () => {
      const api = getSdkApi();

      // Init
      await api.initChat({ appId: "app-1" });
      api.markInitialized({ appId: "app-1" });

      // Connect eagerly
      setState("connectionStatus", "disconnected");
      api.connectEagerly();
      expect(connectWS).toHaveBeenCalled();

      // Send message
      const mockMsg = {
        id: "s1",
        content: "hello",
        type: "text" as const,
        senderRole: "visitor" as const,
        senderId: "v1",
        status: "sent" as const,
        createdAt: "2024-01-01",
      };
      vi.mocked(getMessagePipeline()!.send).mockResolvedValueOnce(mockMsg);
      const sent = await api.sendMessage("hello");
      expect(sent).toEqual(mockMsg);

      // Edit message
      setState("conversationId", "conv-1");
      setState("messages", [mockMsg]);
      api.editMessage("s1", "updated");
      expect(getState("messages")[0]!.content).toBe("updated");

      // Delete message
      api.deleteMessage("s1");
      expect(getState("messages")[0]!.isDeleted).toBe(true);

      // Start new chat
      api.startNewChat();
      expect(getState("conversationId")).toBeNull();

      // Destroy
      api.destroyChat();
      expect(disconnectWS).toHaveBeenCalled();
    });

    it("headless and widget modes route through the same SdkApi", async () => {
      // Headless
      const api1 = getSdkApi();
      await api1.initChat({ appId: "app-1" });
      api1.markInitialized({ headless: true, appId: "app-1" });
      api1.connectEagerly();
      expect(connectWS).toHaveBeenCalled();
      api1.destroyChat();
      api1.markDestroyed();

      vi.mocked(connectWS).mockClear();
      vi.mocked(disconnectWS).mockClear();
      resetSdkApi();
      setState("connectionStatus", "disconnected");

      // Widget mode
      const api2 = getSdkApi();
      await api2.initChat({ appId: "app-2" });
      api2.markInitialized({ appId: "app-2" });
      api2.connectEagerly();
      expect(connectWS).toHaveBeenCalled();
      api2.destroyChat();
      api2.markDestroyed();
    });
  });
});
