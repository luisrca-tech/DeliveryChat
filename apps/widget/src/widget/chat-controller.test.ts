import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./ws.js", () => ({
  connectWS: vi.fn(),
  disconnectWS: vi.fn(),
  sendWSMessage: vi.fn(),
}));

import { disconnectWS } from "./ws.js";

import {
  initChatController,
  destroyChat,
  sendMessage,
  startNewChat,
} from "./chat-controller.js";
import { getState, setState } from "./state.js";

describe("destroyChat", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("clears persisted conversation and state for the active app", () => {
    const appId = "11111111-1111-1111-1111-111111111111";
    localStorage.setItem(`dc_conv_${appId}`, "conv-existing");
    localStorage.setItem(`dc_lastmsg_${appId}`, "msg-1");

    initChatController({ appId });

    expect(getState("conversationId")).toBe("conv-existing");

    destroyChat();

    expect(localStorage.getItem(`dc_conv_${appId}`)).toBeNull();
    expect(localStorage.getItem(`dc_lastmsg_${appId}`)).toBeNull();
    expect(getState("conversationId")).toBeNull();
    expect(getState("conversationStatus")).toBeNull();
    expect(getState("messages")).toEqual([]);
  });
});

describe("sendMessage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    setState("messages", []);
    setState("conversationId", null);
    setState("conversationStatus", null);
  });

  it("does not send a message when conversation is closed", async () => {
    const appId = "22222222-2222-2222-2222-222222222222";
    initChatController({ appId });

    setState("conversationStatus", "closed");
    setState("visitorId", "visitor-1");

    await sendMessage("hello");

    expect(getState("messages")).toEqual([]);
  });
});

describe("startNewChat", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    setState("messages", []);
    setState("conversationId", null);
    setState("conversationStatus", null);
    setState("typingUser", null);
  });

  it("resets conversation state but does not disconnect WebSocket", () => {
    const appId = "33333333-3333-3333-3333-333333333333";
    localStorage.setItem(`dc_conv_${appId}`, "conv-123");
    localStorage.setItem(`dc_lastmsg_${appId}`, "msg-456");

    initChatController({ appId });

    setState("conversationStatus", "closed");
    setState("messages", [
      {
        id: "m1",
        content: "hi",
        senderRole: "visitor",
        senderId: "v1",
        status: "sent",
        createdAt: new Date().toISOString(),
      },
    ]);

    startNewChat();

    expect(getState("conversationId")).toBeNull();
    expect(getState("conversationStatus")).toBeNull();
    expect(getState("messages")).toEqual([]);
    expect(getState("typingUser")).toBeNull();

    expect(localStorage.getItem(`dc_conv_${appId}`)).toBeNull();
    expect(localStorage.getItem(`dc_lastmsg_${appId}`)).toBeNull();

    expect(disconnectWS).not.toHaveBeenCalled();
  });
});
