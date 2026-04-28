import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getState, setState } from "./state.js";

vi.mock("./conversation-persistence.js", () => ({
  clearStaleConversationPersistence: vi.fn(),
}));

vi.mock("./api.js", () => ({
  fetchWsToken: vi.fn().mockResolvedValue("mock-signed-token"),
}));

const wsInstances: MockWS[] = [];

class MockWS {
  static OPEN = 1;
  static CONNECTING = 0;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  readyState = 1;
  url: string;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }
}

vi.stubGlobal("WebSocket", MockWS);

const { connectWS, disconnectWS } = await import("./ws.js");

function latestWS(): MockWS {
  return wsInstances[wsInstances.length - 1]!;
}

async function waitForToken(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("WebSocket error classification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    wsInstances.length = 0;

    setState("connectionStatus", "disconnected");
    setState("connectionError", null);
    setState("conversationId", null);
    setState("messages", []);
  });

  afterEach(() => {
    disconnectWS();
    vi.useRealTimers();
  });

  async function connect() {
    connectWS({
      apiBaseUrl: "http://localhost:8000",
      appId: "test-app-id",
      visitorId: "test-visitor-id",
    });
    await waitForToken();
    latestWS().onopen?.();
  }

  function simulateServerError(code: string, message: string) {
    latestWS().onmessage?.({
      data: JSON.stringify({
        type: "error",
        payload: { code, message },
      }),
    });
  }

  function simulateClose(code?: number) {
    const event = code !== undefined ? { code } : {};
    (latestWS().onclose as (event?: unknown) => void)?.(event);
  }

  describe("token-based connection", () => {
    it("passes the signed token in the WS URL", async () => {
      await connect();
      expect(latestWS().url).toContain("token=mock-signed-token");
      expect(latestWS().url).not.toContain("appId=");
      expect(latestWS().url).not.toContain("visitorId=");
    });
  });

  describe("permanent errors (UNAUTHORIZED)", () => {
    it("sets a permanent connectionError when server sends UNAUTHORIZED error event", async () => {
      await connect();

      simulateServerError("UNAUTHORIZED", "Authentication failed");
      simulateClose();

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("permanent");
    });

    it("detects permanent error from close code 1008 even without error event", async () => {
      await connect();
      simulateClose(1008);

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("permanent");
    });

    it("shows a generic user message for permanent errors", async () => {
      await connect();
      simulateClose(1008);

      const error = getState("connectionError");
      expect(error!.userMessage).toBe("Chat is temporarily unavailable");
    });

    it("includes a detailed dev message for permanent errors", async () => {
      await connect();

      simulateServerError("UNAUTHORIZED", "Authentication failed");
      simulateClose();

      const error = getState("connectionError");
      expect(error!.devMessage).toContain("UNAUTHORIZED");
    });

    it("stops reconnecting after a permanent error", async () => {
      await connect();

      const instanceCountBefore = wsInstances.length;

      simulateClose(1008);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(wsInstances.length).toBe(instanceCountBefore);
    });

    it("treats INVALID_TOKEN as permanent error", async () => {
      await connect();

      simulateServerError("INVALID_TOKEN", "Invalid or tampered WebSocket token");
      simulateClose();

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("permanent");
    });

    it("treats APP_NOT_FOUND as permanent error", async () => {
      await connect();

      simulateServerError("APP_NOT_FOUND", "Application not found");
      simulateClose();

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("permanent");
    });
  });

  describe("temporary errors (network disconnect)", () => {
    it("does not set connectionError on first disconnect", async () => {
      await connect();
      simulateClose();

      const error = getState("connectionError");
      expect(error).toBeNull();
    });

    it("sets a temporary connectionError after multiple failed reconnects", async () => {
      await connect();

      for (let i = 0; i < 5; i++) {
        simulateClose();
        await vi.advanceTimersByTimeAsync(60_000);
      }

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("temporary");
      expect(error!.userMessage).toContain("Connection lost");
    });

    it("attempts to reconnect after temporary disconnects", async () => {
      await connect();

      const instanceCountBefore = wsInstances.length;

      simulateClose();
      await vi.advanceTimersByTimeAsync(5_000);

      expect(wsInstances.length).toBeGreaterThan(instanceCountBefore);
    });
  });

  describe("error recovery", () => {
    it("clears connectionError when connection is re-established", async () => {
      await connect();

      for (let i = 0; i < 5; i++) {
        simulateClose();
        await vi.advanceTimersByTimeAsync(60_000);
      }

      expect(getState("connectionError")).not.toBeNull();

      latestWS().onopen?.();

      expect(getState("connectionError")).toBeNull();
    });
  });

  describe("conversation isolation", () => {
    it("ignores message:new events from a different conversation", async () => {
      await connect();
      setState("conversationId", "conv-mine");
      setState("messages", []);

      latestWS().onmessage?.({
        data: JSON.stringify({
          type: "message:new",
          payload: {
            id: "msg-other",
            conversationId: "conv-other",
            senderId: "admin-1",
            senderRole: "admin",
            content: "Hello from another conversation",
            createdAt: "2026-01-01T00:00:00Z",
          },
        }),
      });

      expect(getState("messages")).toHaveLength(0);
    });

    it("accepts message:new events matching the current conversation", async () => {
      await connect();
      setState("conversationId", "conv-mine");
      setState("messages", []);

      latestWS().onmessage?.({
        data: JSON.stringify({
          type: "message:new",
          payload: {
            id: "msg-mine",
            conversationId: "conv-mine",
            senderId: "admin-1",
            senderRole: "admin",
            content: "Hello from my conversation",
            createdAt: "2026-01-01T00:00:00Z",
          },
        }),
      });

      expect(getState("messages")).toHaveLength(1);
      expect(getState("messages")[0]!.id).toBe("msg-mine");
    });

    it("ignores message:edited events from a different conversation", async () => {
      await connect();
      setState("conversationId", "conv-mine");
      setState("messages", [
        { id: "msg-1", content: "original", senderRole: "admin", senderId: "a1", status: "sent", createdAt: "2026-01-01T00:00:00Z" },
      ]);

      latestWS().onmessage?.({
        data: JSON.stringify({
          type: "message:edited",
          payload: {
            conversationId: "conv-other",
            messageId: "msg-1",
            content: "edited by other conv",
            editedAt: "2026-01-01T00:01:00Z",
            senderId: "a1",
          },
        }),
      });

      expect(getState("messages")[0]!.content).toBe("original");
    });

    it("ignores message:deleted events from a different conversation", async () => {
      await connect();
      setState("conversationId", "conv-mine");
      setState("messages", [
        { id: "msg-1", content: "still here", senderRole: "admin", senderId: "a1", status: "sent", createdAt: "2026-01-01T00:00:00Z" },
      ]);

      latestWS().onmessage?.({
        data: JSON.stringify({
          type: "message:deleted",
          payload: {
            conversationId: "conv-other",
            messageId: "msg-1",
            senderId: "a1",
          },
        }),
      });

      expect(getState("messages")[0]!.content).toBe("still here");
      expect(getState("messages")[0]!.isDeleted).toBeUndefined();
    });
  });

  describe("rate limiting", () => {
    function simulateRateLimit(retryAfter = 3) {
      latestWS().onmessage?.({
        data: JSON.stringify({
          type: "error",
          payload: { code: "RATE_LIMITED", message: "Rate limit exceeded", retryAfter },
        }),
      });
    }

    it("sets rateLimited state on RATE_LIMITED error", async () => {
      await connect();
      expect(getState("rateLimited")).toBe(false);

      simulateRateLimit(5);

      expect(getState("rateLimited")).toBe(true);
      expect(getState("rateLimitRetryAfter")).toBe(5);
    });

    it("clears rateLimited state after retryAfter seconds", async () => {
      await connect();
      simulateRateLimit(3);

      expect(getState("rateLimited")).toBe(true);

      await vi.advanceTimersByTimeAsync(3_000);

      expect(getState("rateLimited")).toBe(false);
      expect(getState("rateLimitRetryAfter")).toBeNull();
    });

    it("marks pending messages as failed on rate limit", async () => {
      await connect();
      setState("messages", [
        { id: "m1", content: "hi", senderRole: "visitor", senderId: "v1", status: "pending", createdAt: "2026-01-01T00:00:00Z" },
        { id: "m2", content: "ok", senderRole: "visitor", senderId: "v1", status: "sent", createdAt: "2026-01-01T00:00:01Z" },
      ]);

      simulateRateLimit(2);

      const msgs = getState("messages");
      expect(msgs[0]!.status).toBe("failed");
      expect(msgs[1]!.status).toBe("sent");
    });

    it("defaults retryAfter to 5 when not provided", async () => {
      await connect();
      latestWS().onmessage?.({
        data: JSON.stringify({
          type: "error",
          payload: { code: "RATE_LIMITED", message: "Rate limit exceeded" },
        }),
      });

      expect(getState("rateLimited")).toBe(true);
      expect(getState("rateLimitRetryAfter")).toBe(5);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(getState("rateLimited")).toBe(false);
    });
  });
});
