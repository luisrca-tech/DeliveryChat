import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSdkApi, resetSdkApi } from "./SdkApi.js";
import { connectEventBridge, disconnectEventBridge } from "./EventBridge.js";
import { setState } from "./state.js";
import type { ChatMessage } from "./types/index.js";

vi.mock("./ws.js", () => ({
  connectWS: vi.fn(),
  disconnectWS: vi.fn(),
  sendWSMessage: vi.fn(),
  getMessagePipeline: vi.fn().mockReturnValue({
    send: vi.fn(),
    clearAllPending: vi.fn(),
  }),
}));

vi.mock("./conversation.js", () => ({
  markConversationAsRead: vi.fn().mockResolvedValue(undefined),
}));

describe("Event Lifecycle Integration", () => {
  beforeEach(() => {
    resetSdkApi();
    disconnectEventBridge();

    setState("isOpen", false);
    setState("connectionStatus", "disconnected");
    setState("conversationId", null);
    setState("conversationStatus", null);
    setState("unreadCount", 0);
    setState("messages", []);
    setState("visitorId", "visitor-1");
    setState("widgetVisible", true);
  });

  function bootSdk() {
    const api = getSdkApi();
    api.markInitialized();
    connectEventBridge(api.emitter);
    return api;
  }

  it("ready fires when connectionStatus transitions to connected", () => {
    const api = bootSdk();
    const listener = vi.fn();
    api.on("ready", listener);

    setState("connectionStatus", "connected");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("open/close fire through SdkApi.open() and SdkApi.close()", () => {
    const api = bootSdk();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    api.on("open", onOpen);
    api.on("close", onClose);

    api.open();
    expect(onOpen).toHaveBeenCalledOnce();

    api.close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("toggle cycles open → close → open", () => {
    const api = bootSdk();
    const events: string[] = [];
    api.on("open", () => events.push("open"));
    api.on("close", () => events.push("close"));

    api.toggle();
    api.toggle();
    api.toggle();

    expect(events).toEqual(["open", "close", "open"]);
  });

  it("conversation:started fires when conversationId goes from null to a value", () => {
    const api = bootSdk();
    const listener = vi.fn();
    api.on("conversation:started", listener);

    setState("conversationId", "conv-1");

    expect(listener).toHaveBeenCalledWith({ conversationId: "conv-1" });
  });

  it("conversation:resolved fires when status becomes closed", () => {
    const api = bootSdk();
    const listener = vi.fn();
    api.on("conversation:resolved", listener);

    setState("conversationId", "conv-1");
    setState("conversationStatus", "closed");

    expect(listener).toHaveBeenCalledWith({ conversationId: "conv-1" });
  });

  it("unread:changed fires with count payload", () => {
    const api = bootSdk();
    const listener = vi.fn();
    api.on("unread:changed", listener);

    setState("unreadCount", 3);

    expect(listener).toHaveBeenCalledWith({ count: 3 });
  });

  it("message:received fires when emitted by MessagePipeline", () => {
    const api = bootSdk();
    const listener = vi.fn();
    api.on("message:received", listener);

    const msg: ChatMessage = {
      id: "msg-1",
      content: "Hello from support",
      type: "text",
      senderRole: "operator",
      senderId: "op-1",
      status: "sent",
      createdAt: "2024-01-01T00:00:00Z",
    };

    api.emitter.emit("message:received", msg);

    expect(listener).toHaveBeenCalledWith(msg);
  });

  it("message:sent fires when emitted by MessagePipeline after ACK", () => {
    const api = bootSdk();
    const listener = vi.fn();
    api.on("message:sent", listener);

    const acked: ChatMessage = {
      id: "server-uuid",
      content: "Hi there",
      type: "text",
      senderRole: "visitor",
      senderId: "visitor-1",
      status: "sent",
      createdAt: "2024-01-01T00:00:00Z",
    };

    api.emitter.emit("message:sent", acked);

    expect(listener).toHaveBeenCalledWith(acked);
  });

  it("events stop after destroy", () => {
    const api = bootSdk();
    const listener = vi.fn();
    api.on("open", listener);

    api.markDestroyed();
    disconnectEventBridge();

    setState("isOpen", true);

    expect(listener).not.toHaveBeenCalled();
  });

  it("pre-init listeners receive events after bridge connects", () => {
    const api = getSdkApi();
    const listener = vi.fn();
    api.on("ready", listener);

    api.markInitialized();
    connectEventBridge(api.emitter);

    setState("connectionStatus", "connected");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("full lifecycle: init → ready → conversation → messages → resolve → destroy", () => {
    const events: string[] = [];
    const api = bootSdk();

    api.on("ready", () => events.push("ready"));
    api.on("open", () => events.push("open"));
    api.on("conversation:started", () => events.push("conversation:started"));
    api.on("message:received", () => events.push("message:received"));
    api.on("conversation:resolved", () => events.push("conversation:resolved"));
    api.on("close", () => events.push("close"));

    setState("connectionStatus", "connected");
    api.open();
    setState("conversationId", "conv-1");

    const msg: ChatMessage = {
      id: "msg-1",
      content: "Welcome!",
      type: "text",
      senderRole: "operator",
      senderId: "op-1",
      status: "sent",
      createdAt: "2024-01-01T00:00:00Z",
    };
    api.emitter.emit("message:received", msg);

    setState("conversationStatus", "closed");
    api.close();

    expect(events).toEqual([
      "ready",
      "open",
      "conversation:started",
      "message:received",
      "conversation:resolved",
      "close",
    ]);

    api.markDestroyed();
    disconnectEventBridge();
  });
});
