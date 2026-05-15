import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSdkApi, resetSdkApi } from "./SdkApi.js";

vi.mock("./state.js", () => {
  let state: Record<string, unknown> = {
    isOpen: false,
    conversationId: null,
    conversationStatus: null,
    messages: [],
  };
  return {
    getState: vi.fn((key: string) => state[key]),
    setState: vi.fn((key: string, value: unknown) => {
      state[key] = typeof value === "function" ? (value as (p: unknown) => unknown)(state[key]) : value;
    }),
    subscribe: vi.fn(() => () => {}),
  };
});

vi.mock("./chat-controller.js", () => ({
  openChat: vi.fn(),
  sendMessageAsync: vi.fn(),
}));

import { getState, setState } from "./state.js";
import { openChat, sendMessageAsync } from "./chat-controller.js";

const mockedGetState = vi.mocked(getState);
const mockedSetState = vi.mocked(setState);

describe("SdkApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSdkApi();
    mockedSetState.mockImplementation(((key: string, value: unknown) => {
      const current = mockedGetState(key as never);
      const next = typeof value === "function" ? (value as (p: unknown) => unknown)(current) : value;
      mockedGetState.mockImplementation(((k: string) => {
        if (k === key) return next;
        return undefined;
      }) as typeof getState);
    }) as typeof setState);
  });

  describe("before init", () => {
    it("open() throws a clear error", () => {
      const api = getSdkApi();
      expect(() => api.open()).toThrow("[DeliveryChat] SDK not initialized. Call init() first.");
    });

    it("close() throws a clear error", () => {
      const api = getSdkApi();
      expect(() => api.close()).toThrow("[DeliveryChat] SDK not initialized. Call init() first.");
    });

    it("toggle() throws a clear error", () => {
      const api = getSdkApi();
      expect(() => api.toggle()).toThrow("[DeliveryChat] SDK not initialized. Call init() first.");
    });

    it("hideWidget() throws a clear error", () => {
      const api = getSdkApi();
      expect(() => api.hideWidget()).toThrow("[DeliveryChat] SDK not initialized. Call init() first.");
    });

    it("showWidget() throws a clear error", () => {
      const api = getSdkApi();
      expect(() => api.showWidget()).toThrow("[DeliveryChat] SDK not initialized. Call init() first.");
    });
  });

  describe("after markInitialized", () => {
    it("open() sets isOpen to true and calls openChat", () => {
      const api = getSdkApi();
      api.markInitialized();

      mockedGetState.mockReturnValue(false as never);
      api.open();

      expect(setState).toHaveBeenCalledWith("isOpen", true);
      expect(openChat).toHaveBeenCalled();
    });

    it("close() sets isOpen to false", () => {
      const api = getSdkApi();
      api.markInitialized();

      mockedGetState.mockReturnValue(true as never);
      api.close();

      expect(setState).toHaveBeenCalledWith("isOpen", false);
    });

    it("toggle() opens when closed", () => {
      const api = getSdkApi();
      api.markInitialized();

      mockedGetState.mockReturnValue(false as never);
      api.toggle();

      expect(setState).toHaveBeenCalledWith("isOpen", true);
    });

    it("toggle() closes when open", () => {
      const api = getSdkApi();
      api.markInitialized();

      mockedGetState.mockReturnValue(true as never);
      api.toggle();

      expect(setState).toHaveBeenCalledWith("isOpen", false);
    });

    it("hideWidget() hides the launcher", () => {
      const api = getSdkApi();
      api.markInitialized();
      api.hideWidget();

      expect(setState).toHaveBeenCalledWith("widgetVisible", false);
    });

    it("showWidget() shows the launcher", () => {
      const api = getSdkApi();
      api.markInitialized();
      api.showWidget();

      expect(setState).toHaveBeenCalledWith("widgetVisible", true);
    });
  });

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

    it("on() works before init (queued listeners are already on the emitter)", () => {
      const api = getSdkApi();
      const listener = vi.fn();

      api.on("message:received", listener);
      api.emitter.emit("message:received", { id: "1", content: "hello", type: "text", senderRole: "operator", senderId: "op1", status: "sent", createdAt: "2024-01-01" });

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe("headless mode", () => {
    it("open/close/toggle/hideWidget/showWidget are no-ops when headless", () => {
      const api = getSdkApi();
      api.markInitialized({ headless: true });

      api.open();
      api.close();
      api.toggle();
      api.hideWidget();
      api.showWidget();

      expect(setState).not.toHaveBeenCalled();
      expect(openChat).not.toHaveBeenCalled();
    });

    it("sendMessage throws before init", async () => {
      const api = getSdkApi();
      await expect(api.sendMessage("hello")).rejects.toThrow("SDK not initialized");
    });

    it("sendMessage delegates to sendMessageAsync", async () => {
      const api = getSdkApi();
      api.markInitialized();

      const mockMsg = {
        id: "s1",
        content: "hello",
        type: "text" as const,
        senderRole: "visitor" as const,
        senderId: "v1",
        status: "sent" as const,
        createdAt: "2024-01-01",
      };
      vi.mocked(sendMessageAsync).mockResolvedValueOnce(mockMsg);

      const result = await api.sendMessage("hello");
      expect(sendMessageAsync).toHaveBeenCalledWith("hello");
      expect(result).toBe(mockMsg);
    });

    it("getConversation returns null when no active conversation", () => {
      const api = getSdkApi();
      api.markInitialized();

      mockedGetState.mockImplementation(((key: string) => {
        if (key === "conversationId") return null;
        if (key === "conversationStatus") return null;
        if (key === "messages") return [];
        return undefined;
      }) as typeof getState);

      expect(api.getConversation()).toBeNull();
    });

    it("getConversation returns snapshot when conversation exists", () => {
      const api = getSdkApi();
      api.markInitialized();

      const messages = [
        { id: "m1", content: "hi", type: "text" as const, senderRole: "visitor" as const, senderId: "v1", status: "sent" as const, createdAt: "2024-01-01" },
      ];

      mockedGetState.mockImplementation(((key: string) => {
        if (key === "conversationId") return "conv-1";
        if (key === "conversationStatus") return "active";
        if (key === "messages") return messages;
        return undefined;
      }) as typeof getState);

      const result = api.getConversation();
      expect(result).toEqual({
        id: "conv-1",
        status: "active",
        messages,
      });
    });

    it("getConversation throws before init", () => {
      const api = getSdkApi();
      expect(() => api.getConversation()).toThrow("SDK not initialized");
    });
  });
});
