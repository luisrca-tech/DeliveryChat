import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./ws.js", () => ({
  disconnectWS: vi.fn(),
}));

import { initChatController, destroyChat } from "./chat-controller.js";
import { getState } from "./state.js";

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
