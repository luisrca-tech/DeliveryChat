import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "./EventEmitter.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import { connectEventBridge, disconnectEventBridge } from "./EventBridge.js";
import { setState, subscribe, getState } from "./state.js";
import type { ChatMessage } from "./types/index.js";
import { getSdkApi } from "./SdkApi.js";

let mockHeadless = false;
vi.mock("./SdkApi.js", () => ({
  getSdkApi: vi.fn(() => ({
    isHeadless: () => mockHeadless,
  })),
}));

vi.mock("./state.js", () => {
  const subscriptions = new Map<string, Set<(value: unknown) => void>>();
  const stateStore: Record<string, unknown> = {
    isOpen: false,
    unreadCount: 0,
    conversationStatus: null,
    conversationId: null,
    messages: [],
    connectionStatus: "disconnected",
    visitorId: "visitor-1",
  };

  return {
    getState: vi.fn((key: string) => stateStore[key]),
    setState: vi.fn((key: string, value: unknown) => {
      const prev = stateStore[key];
      const next = typeof value === "function" ? (value as (p: unknown) => unknown)(prev) : value;
      if (prev === next) return;
      stateStore[key] = next;
      subscriptions.get(key)?.forEach((fn) => fn(next));
    }),
    subscribe: vi.fn((key: string, listener: (value: unknown) => void) => {
      if (!subscriptions.has(key)) subscriptions.set(key, new Set());
      subscriptions.get(key)!.add(listener);
      return () => subscriptions.get(key)?.delete(listener);
    }),
  };
});

describe("EventBridge", () => {
  let emitter: EventEmitter<SdkEventMap>;

  beforeEach(() => {
    vi.clearAllMocks();
    emitter = new EventEmitter<SdkEventMap>();
  });

  afterEach(() => {
    disconnectEventBridge();
  });

  it("fires 'open' when isOpen changes to true", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("open", listener);

    setState("isOpen", true);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("fires 'close' when isOpen changes to false", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("close", listener);

    setState("isOpen", true);
    setState("isOpen", false);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("fires 'unread:changed' with count payload", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("unread:changed", listener);

    setState("unreadCount", 5);

    expect(listener).toHaveBeenCalledWith({ count: 5 });
  });

  it("fires 'conversation:resolved' when conversationStatus becomes closed", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("conversation:resolved", listener);

    vi.mocked(getState).mockImplementation(((key: string) => {
      if (key === "conversationId") return "conv-123";
      return null;
    }) as typeof getState);

    setState("conversationStatus", "closed");

    expect(listener).toHaveBeenCalledWith({ conversationId: "conv-123" });
  });

  it("fires 'conversation:started' when conversationId is set from null", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("conversation:started", listener);

    setState("conversationId", "conv-456");

    expect(listener).toHaveBeenCalledWith({ conversationId: "conv-456" });
  });

  it("does not fire 'conversation:started' when conversationId changes between non-null values", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();

    setState("conversationId", "conv-1");

    emitter.on("conversation:started", listener);
    setState("conversationId", "conv-2");

    expect(listener).not.toHaveBeenCalled();
  });

  it("fires 'ready' when connectionStatus becomes connected", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("ready", listener);

    setState("connectionStatus", "connected");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("fires 'message:received' for incoming non-visitor messages", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("message:received", listener);

    const msg: ChatMessage = {
      id: "msg-1",
      content: "hello",
      type: "text",
      senderRole: "operator",
      senderId: "op-1",
      status: "sent",
      createdAt: "2024-01-01T00:00:00Z",
    };

    vi.mocked(getState).mockImplementation(((key: string) => {
      if (key === "visitorId") return "visitor-1";
      return null;
    }) as typeof getState);

    setState("messages", [msg]);

    expect(listener).toHaveBeenCalledWith(msg);
  });

  it("fires 'message:sent' when a pending visitor message becomes sent", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("message:sent", listener);

    const pending: ChatMessage = {
      id: "client-1",
      content: "hi",
      type: "text",
      senderRole: "visitor",
      senderId: "visitor-1",
      status: "pending",
      createdAt: "2024-01-01T00:00:00Z",
    };

    vi.mocked(getState).mockImplementation(((key: string) => {
      if (key === "visitorId") return "visitor-1";
      return null;
    }) as typeof getState);

    setState("messages", [pending]);

    const sent: ChatMessage = { ...pending, id: "server-1", status: "sent" };
    setState("messages", [sent]);

    expect(listener).toHaveBeenCalledWith(sent);
  });

  it("disconnectEventBridge stops all event firing", () => {
    connectEventBridge(emitter);
    const listener = vi.fn();
    emitter.on("open", listener);

    disconnectEventBridge();
    setState("isOpen", true);

    expect(listener).not.toHaveBeenCalled();
  });

  describe("headless mode", () => {
    beforeEach(() => {
      mockHeadless = true;
      setState("connectionStatus", "disconnected");
    });

    afterEach(() => {
      mockHeadless = false;
    });

    it("suppresses 'open' event when headless", () => {
      connectEventBridge(emitter);
      const listener = vi.fn();
      emitter.on("open", listener);

      setState("isOpen", true);

      expect(listener).not.toHaveBeenCalled();
    });

    it("suppresses 'close' event when headless", () => {
      connectEventBridge(emitter);
      const listener = vi.fn();
      emitter.on("close", listener);

      setState("isOpen", true);
      setState("isOpen", false);

      expect(listener).not.toHaveBeenCalled();
    });

    it("still fires non-UI events like 'ready' when headless", () => {
      connectEventBridge(emitter);
      const listener = vi.fn();
      emitter.on("ready", listener);

      setState("connectionStatus", "connected");

      expect(listener).toHaveBeenCalledOnce();
    });
  });
});
