import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./api.js", () => ({
  fetchWsToken: vi.fn().mockResolvedValue("mock-signed-token"),
}));

const wsInstances: MockWS[] = [];

class MockWS {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
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

import { ConnectionEngine, type ConnectionState } from "./ConnectionEngine.js";
import type { ConnectionError } from "./types/index.js";
import { fetchWsToken } from "./api.js";

function latestWS(): MockWS {
  return wsInstances[wsInstances.length - 1]!;
}

async function flushTokenFetch(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("ConnectionEngine", () => {
  let engine: ConnectionEngine;
  let onStateChange: ReturnType<typeof vi.fn<(state: ConnectionState, error?: ConnectionError) => void>>;
  let onMessage: ReturnType<typeof vi.fn<(event: { type: string; payload?: unknown }) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    wsInstances.length = 0;

    onStateChange = vi.fn<(state: ConnectionState, error?: ConnectionError) => void>();
    onMessage = vi.fn<(event: { type: string; payload?: unknown }) => void>();
    engine = new ConnectionEngine({ onStateChange, onMessage });
  });

  afterEach(() => {
    engine.disconnect();
    vi.useRealTimers();
  });

  async function connect() {
    engine.connect({
      apiBaseUrl: "http://localhost:8000",
      appId: "test-app",
      visitorId: "test-visitor",
    });
    await flushTokenFetch();
    latestWS().onopen?.();
  }

  describe("connect", () => {
    it("fetches a token and opens a WebSocket connection", async () => {
      await connect();

      expect(fetchWsToken).toHaveBeenCalledWith(
        "http://localhost:8000",
        "test-app",
        "test-visitor",
      );
      expect(latestWS().url).toContain("token=mock-signed-token");
    });

    it("emits 'connecting' then 'connected' state changes", async () => {
      engine.connect({
        apiBaseUrl: "http://localhost:8000",
        appId: "test-app",
        visitorId: "test-visitor",
      });

      expect(onStateChange).toHaveBeenCalledWith("connecting");

      await flushTokenFetch();
      latestWS().onopen?.();

      expect(onStateChange).toHaveBeenCalledWith("connected");
    });

    it("cleans up previous connection before creating a new one", async () => {
      await connect();
      const firstWs = latestWS();

      await connect();

      expect(firstWs.close).toHaveBeenCalled();
      expect(wsInstances.length).toBe(2);
    });
  });

  describe("disconnect", () => {
    it("closes the WebSocket and emits 'disconnected'", async () => {
      await connect();
      const ws = latestWS();

      engine.disconnect();

      expect(ws.close).toHaveBeenCalled();
      expect(onStateChange).toHaveBeenCalledWith("disconnected");
    });

    it("does not attempt to reconnect after intentional disconnect", async () => {
      await connect();

      engine.disconnect();
      const countAfterDisconnect = wsInstances.length;

      await vi.advanceTimersByTimeAsync(60_000);

      expect(wsInstances.length).toBe(countAfterDisconnect);
    });
  });

  describe("send", () => {
    it("sends a JSON-stringified message when connected", async () => {
      await connect();
      const ws = latestWS();

      engine.send({ type: "ping" });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));
    });

    it("silently drops messages when not connected", () => {
      engine.send({ type: "ping" });
      expect(wsInstances.length).toBe(0);
    });
  });

  describe("onMessage callback", () => {
    it("forwards parsed server events to the onMessage handler", async () => {
      await connect();

      latestWS().onmessage?.({
        data: JSON.stringify({ type: "message:new", payload: { id: "1" } }),
      });

      expect(onMessage).toHaveBeenCalledWith({
        type: "message:new",
        payload: { id: "1" },
      });
    });

    it("ignores non-JSON messages", async () => {
      await connect();

      latestWS().onmessage?.({ data: "not-json" });

      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  describe("reconnect on error", () => {
    it("schedules a reconnect after unexpected close", async () => {
      await connect();
      const countBefore = wsInstances.length;

      latestWS().onclose?.();
      // First failure: attempts=1, delay = 1000 * 2^1 = 2000ms
      await vi.advanceTimersByTimeAsync(2_500);
      await flushTokenFetch();

      expect(wsInstances.length).toBeGreaterThan(countBefore);
    });

    it("does not reconnect after intentional disconnect", async () => {
      await connect();
      engine.disconnect();

      const countAfter = wsInstances.length;
      await vi.advanceTimersByTimeAsync(60_000);

      expect(wsInstances.length).toBe(countAfter);
    });
  });

  describe("reconnect backoff", () => {
    it("uses exponential backoff for successive reconnect attempts", async () => {
      await connect();

      // First close → attempts=1, delay = 1000 * 2^1 = 2000ms
      latestWS().onclose?.();
      await vi.advanceTimersByTimeAsync(1_500);
      const countBeforeFirstReconnect = wsInstances.length;

      await vi.advanceTimersByTimeAsync(1_000);
      await flushTokenFetch();
      const countAfterFirstDelay = wsInstances.length;
      expect(countAfterFirstDelay).toBeGreaterThan(countBeforeFirstReconnect);

      // Second close → attempts=2, delay = 1000 * 2^2 = 4000ms
      latestWS().onclose?.();

      await vi.advanceTimersByTimeAsync(3_000);
      const countDuringSecondDelay = wsInstances.length;

      await vi.advanceTimersByTimeAsync(2_000);
      await flushTokenFetch();
      const countAfterSecondDelay = wsInstances.length;
      expect(countAfterSecondDelay).toBeGreaterThan(countDuringSecondDelay);
    });

    it("caps backoff at RECONNECT_MAX_DELAY", async () => {
      await connect();

      // Force many reconnect attempts
      for (let i = 0; i < 20; i++) {
        latestWS().onclose?.();
        await vi.advanceTimersByTimeAsync(31_000);
        await flushTokenFetch();
      }

      // Should still be reconnecting (not hung)
      const count = wsInstances.length;
      latestWS().onclose?.();
      await vi.advanceTimersByTimeAsync(31_000);
      expect(wsInstances.length).toBeGreaterThan(count);
    });

    it("resets backoff on successful reconnection", async () => {
      await connect();

      // Fail a few times
      latestWS().onclose?.();
      await vi.advanceTimersByTimeAsync(1_500);
      await flushTokenFetch();
      latestWS().onclose?.();
      await vi.advanceTimersByTimeAsync(3_000);
      await flushTokenFetch();

      // Successful reconnect
      latestWS().onopen?.();

      // Next failure should use base delay again
      latestWS().onclose?.();
      const countBefore = wsInstances.length;
      await vi.advanceTimersByTimeAsync(1_500);
      expect(wsInstances.length).toBeGreaterThan(countBefore);
    });
  });

  describe("ping heartbeat", () => {
    it("sends periodic ping messages while connected", async () => {
      await connect();
      const ws = latestWS();

      ws.send.mockClear();
      await vi.advanceTimersByTimeAsync(25_000);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));
    });

    it("stops pinging after disconnect", async () => {
      await connect();
      const ws = latestWS();

      engine.disconnect();
      ws.send.mockClear();

      await vi.advanceTimersByTimeAsync(50_000);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("permanent error handling", () => {
    it("reports permanent error for PERMANENT_CLOSE_CODES and stops reconnecting", async () => {
      await connect();
      const countBefore = wsInstances.length;

      latestWS().onclose?.({ code: 1008 });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(wsInstances.length).toBe(countBefore);

      expect(onStateChange).toHaveBeenCalledWith("disconnected");
    });

    it("reports permanent error when server sends a permanent error code before close", async () => {
      await connect();

      onMessage.mockImplementation((event: { type: string; payload?: unknown }) => {
        if (event.type === "error") {
          const payload = event.payload as { code: string };
          engine.markServerError(payload.code);
        }
      });

      latestWS().onmessage?.({
        data: JSON.stringify({
          type: "error",
          payload: { code: "UNAUTHORIZED", message: "Authentication failed" },
        }),
      });

      latestWS().onclose?.();

      const countAfterClose = wsInstances.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(wsInstances.length).toBe(countAfterClose);
    });
  });

  describe("temporary error reporting", () => {
    it("emits temporary error info after RECONNECT_WARN_THRESHOLD failures", async () => {
      await connect();

      for (let i = 0; i < 5; i++) {
        latestWS().onclose?.();
        await vi.advanceTimersByTimeAsync(60_000);
        await flushTokenFetch();
      }

      expect(onStateChange).toHaveBeenCalledWith(
        "connecting",
        expect.objectContaining({ type: "temporary" }),
      );
    });
  });
});
