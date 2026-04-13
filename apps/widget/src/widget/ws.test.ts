import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getState, setState } from "./state.js";

// Mock conversation-persistence to avoid localStorage issues
vi.mock("./conversation-persistence.js", () => ({
  clearStaleConversationPersistence: vi.fn(),
}));

// Track all created WebSocket instances
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

  constructor() {
    wsInstances.push(this);
  }
}

vi.stubGlobal("WebSocket", MockWS);

// Import after mocks
const { connectWS, disconnectWS } = await import("./ws.js");

function latestWS(): MockWS {
  return wsInstances[wsInstances.length - 1]!;
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

  function connect() {
    connectWS({
      apiBaseUrl: "http://localhost:8000",
      appId: "test-app-id",
      visitorId: "test-visitor-id",
    });
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

  describe("permanent errors (UNAUTHORIZED)", () => {
    it("sets a permanent connectionError when server sends UNAUTHORIZED error event", () => {
      connect();

      simulateServerError("UNAUTHORIZED", "Authentication failed");
      simulateClose();

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("permanent");
    });

    it("detects permanent error from close code 1008 even without error event", () => {
      connect();

      // Server closes with 1008 but error message was lost in the race
      simulateClose(1008);

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("permanent");
    });

    it("shows a generic user message for permanent errors", () => {
      connect();

      simulateClose(1008);

      const error = getState("connectionError");
      expect(error!.userMessage).toBe("Chat is temporarily unavailable");
    });

    it("includes a detailed dev message for permanent errors", () => {
      connect();

      simulateServerError("UNAUTHORIZED", "Authentication failed");
      simulateClose();

      const error = getState("connectionError");
      expect(error!.devMessage).toContain("UNAUTHORIZED");
    });

    it("stops reconnecting after a permanent error", () => {
      connect();

      const instanceCountBefore = wsInstances.length;

      simulateClose(1008);

      // Advance time well past any backoff delay
      vi.advanceTimersByTime(60_000);

      // No new WebSocket connections should have been created
      expect(wsInstances.length).toBe(instanceCountBefore);
    });
  });

  describe("temporary errors (network disconnect)", () => {
    it("does not set connectionError on first disconnect", () => {
      connect();
      simulateClose();

      const error = getState("connectionError");
      expect(error).toBeNull();
    });

    it("sets a temporary connectionError after multiple failed reconnects", () => {
      connect();

      // Simulate 5 disconnect/reconnect cycles without successful onopen
      for (let i = 0; i < 5; i++) {
        simulateClose(); // disconnects, increments reconnectAttempts, schedules reconnect
        vi.advanceTimersByTime(60_000); // trigger reconnect timer → new WebSocket created
        // Don't call onopen — simulate failed connections
      }

      const error = getState("connectionError");
      expect(error).not.toBeNull();
      expect(error!.type).toBe("temporary");
      expect(error!.userMessage).toContain("Connection lost");
    });

    it("attempts to reconnect after temporary disconnects", () => {
      connect();

      const instanceCountBefore = wsInstances.length;

      simulateClose();
      vi.advanceTimersByTime(5_000);

      // Should have created at least one new WebSocket
      expect(wsInstances.length).toBeGreaterThan(instanceCountBefore);
    });
  });

  describe("error recovery", () => {
    it("clears connectionError when connection is re-established", () => {
      connect();

      // Cause multiple failures to set temporary error
      for (let i = 0; i < 5; i++) {
        simulateClose();
        vi.advanceTimersByTime(60_000);
      }

      expect(getState("connectionError")).not.toBeNull();

      // Simulate successful reconnection
      latestWS().onopen?.();

      expect(getState("connectionError")).toBeNull();
    });
  });
});
