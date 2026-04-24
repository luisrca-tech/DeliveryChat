import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetConversationMessages } = vi.hoisted(() => ({
  mockGetConversationMessages: vi.fn(),
}));

vi.mock("./ws.js", () => ({
  connectWS: vi.fn(),
  disconnectWS: vi.fn(),
  sendWSMessage: vi.fn(),
}));

vi.mock("./conversation.js", () => ({
  createConversation: vi.fn(),
  getConversationMessages: mockGetConversationMessages,
}));

import { disconnectWS } from "./ws.js";

import {
  initChatController,
  destroyChat,
  sendMessage,
  startNewChat,
} from "./chat-controller.js";
import { getState, setState } from "./state.js";

describe("initChatController — conversation history restoration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    setState("messages", []);
    setState("conversationId", null);
    setState("conversationStatus", null);
  });

  it("fetches message history when a persisted conversationId exists", async () => {
    const appId = "aaaa1111-1111-1111-1111-111111111111";
    const convId = "conv-persisted-1";
    localStorage.setItem(`dc_conv_${appId}`, convId);

    mockGetConversationMessages.mockResolvedValueOnce({
      messages: [
        {
          id: "msg-1",
          conversationId: convId,
          senderId: "visitor-1",
          senderName: null,
          type: "text",
          content: "Hello",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "msg-2",
          conversationId: convId,
          senderId: "operator-1",
          senderName: "Agent",
          type: "text",
          content: "Hi there!",
          createdAt: "2026-01-01T00:01:00Z",
        },
      ],
      limit: 50,
      offset: 0,
    });

    await initChatController({ appId });

    expect(mockGetConversationMessages).toHaveBeenCalledWith(
      expect.any(String),
      appId,
      convId,
    );

    const messages = getState("messages");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "msg-1",
      content: "Hello",
      status: "sent",
    });
    expect(messages[1]).toMatchObject({
      id: "msg-2",
      content: "Hi there!",
      status: "sent",
    });
  });

  it("does not fetch messages when no persisted conversationId exists", async () => {
    const appId = "bbbb2222-2222-2222-2222-222222222222";

    await initChatController({ appId });

    expect(mockGetConversationMessages).not.toHaveBeenCalled();
    expect(getState("messages")).toEqual([]);
    expect(getState("conversationId")).toBeNull();
  });

  it("clears persisted conversation when fetch returns 404 (conversation deleted)", async () => {
    const appId = "cccc3333-3333-3333-3333-333333333333";
    const convId = "conv-deleted";
    localStorage.setItem(`dc_conv_${appId}`, convId);

    mockGetConversationMessages.mockRejectedValueOnce(
      new Error("Failed to fetch messages (404)"),
    );

    await initChatController({ appId });

    expect(getState("conversationId")).toBeNull();
    expect(getState("messages")).toEqual([]);
    expect(localStorage.getItem(`dc_conv_${appId}`)).toBeNull();
  });

  it("keeps conversationId but leaves messages empty on network error", async () => {
    const appId = "dddd4444-4444-4444-4444-444444444444";
    const convId = "conv-net-error";
    localStorage.setItem(`dc_conv_${appId}`, convId);

    mockGetConversationMessages.mockRejectedValueOnce(
      new Error("Failed to fetch messages (500)"),
    );

    await initChatController({ appId });

    // conversationId preserved — server may come back
    expect(getState("conversationId")).toBe(convId);
    expect(getState("messages")).toEqual([]);
  });

  it("orders restored messages chronologically (oldest first)", async () => {
    const appId = "eeee5555-5555-5555-5555-555555555555";
    const convId = "conv-order";
    localStorage.setItem(`dc_conv_${appId}`, convId);

    // Backend returns DESC order (newest first)
    mockGetConversationMessages.mockResolvedValueOnce({
      messages: [
        {
          id: "msg-new",
          conversationId: convId,
          senderId: "op-1",
          senderName: "Agent",
          type: "text",
          content: "Second",
          createdAt: "2026-01-01T00:01:00Z",
        },
        {
          id: "msg-old",
          conversationId: convId,
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

    await initChatController({ appId });

    const messages = getState("messages");
    expect(messages).toHaveLength(2);
    expect(messages[0]!.id).toBe("msg-old");
    expect(messages[1]!.id).toBe("msg-new");
  });
});

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

  it("does not send a message when rate-limited", async () => {
    const appId = "44444444-4444-4444-4444-444444444444";
    await initChatController({ appId });

    setState("conversationStatus", "active");
    setState("visitorId", "visitor-1");
    setState("conversationId", "conv-1");
    setState("rateLimited", true);

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
