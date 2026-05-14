import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWebSocketConnection } from "../useWebSocketConnection";
import type { ChatClient } from "../../chat-client";

class MockWebSocket {
  readyState = WebSocket.OPEN;
  send = vi.fn();
  close = vi.fn();

  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  addEventListener(event: string, handler: (...args: unknown[]) => void) {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...existing, handler]);
  }

  removeEventListener(event: string, handler: (...args: unknown[]) => void) {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, existing.filter((h) => h !== handler));
  }

  trigger(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

// Each call to connectWebSocket yields a fresh socket so that accumulated listeners
// from strict-mode double-invocations don't contaminate each other.
function makeMockClient(sockets: MockWebSocket[] = []): ChatClient {
  return {
    getWsToken: vi.fn().mockResolvedValue({ token: "test-token" }),
    connectWebSocket: vi.fn().mockImplementation(() => {
      const ws = new MockWebSocket();
      sockets.push(ws);
      return Promise.resolve(ws);
    }),
  } as unknown as ChatClient;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useWebSocketConnection", () => {
  it("sends room:join after establishing a connection", async () => {
    const sockets: MockWebSocket[] = [];
    const client = makeMockClient(sockets);

    renderHook(() =>
      useWebSocketConnection({
        selectedId: "conv-1",
        client,
        getLastMessageId: vi.fn().mockReturnValue(null),
        onMessageRef: { current: vi.fn() },
        onResetTyping: vi.fn(),
      }),
    );

    await waitFor(() => {
      const lastSocket = sockets[sockets.length - 1];
      expect(lastSocket?.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "room:join", payload: { conversationId: "conv-1" } }),
      );
    });
  });

  it("includes lastMessageId in room:join when available", async () => {
    const sockets: MockWebSocket[] = [];
    const client = makeMockClient(sockets);

    renderHook(() =>
      useWebSocketConnection({
        selectedId: "conv-1",
        client,
        getLastMessageId: vi.fn().mockReturnValue("last-msg-42"),
        onMessageRef: { current: vi.fn() },
        onResetTyping: vi.fn(),
      }),
    );

    await waitFor(() => {
      const lastSocket = sockets[sockets.length - 1];
      expect(lastSocket?.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "room:join",
          payload: { conversationId: "conv-1", lastMessageId: "last-msg-42" },
        }),
      );
    });
  });

  it("sets wsStatus to connected after successful connection", async () => {
    const client = makeMockClient();

    const { result } = renderHook(() =>
      useWebSocketConnection({
        selectedId: "conv-1",
        client,
        getLastMessageId: vi.fn().mockReturnValue(null),
        onMessageRef: { current: vi.fn() },
        onResetTyping: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.wsStatus).toBe("connected");
    });
  });

  it("calls onResetTyping on selectedId change", () => {
    const client = makeMockClient();
    const onResetTyping = vi.fn();

    const { rerender } = renderHook(
      ({ selectedId }: { selectedId: string | null }) =>
        useWebSocketConnection({
          selectedId,
          client,
          getLastMessageId: vi.fn().mockReturnValue(null),
          onMessageRef: { current: vi.fn() },
          onResetTyping,
        }),
      { initialProps: { selectedId: "conv-1" } },
    );

    const callsBefore = onResetTyping.mock.calls.length;
    rerender({ selectedId: "conv-2" });

    expect(onResetTyping.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("closes previous socket when selectedId changes", async () => {
    const sockets: MockWebSocket[] = [];
    const client = makeMockClient(sockets);

    const { rerender } = renderHook(
      ({ selectedId }: { selectedId: string | null }) =>
        useWebSocketConnection({
          selectedId,
          client,
          getLastMessageId: vi.fn().mockReturnValue(null),
          onMessageRef: { current: vi.fn() },
          onResetTyping: vi.fn(),
        }),
      { initialProps: { selectedId: "conv-1" } },
    );

    // Wait for initial connection
    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(0);
      expect(sockets[sockets.length - 1]?.send).toHaveBeenCalled();
    });

    const firstSocket = sockets[sockets.length - 1]!;

    rerender({ selectedId: "conv-2" });

    expect(firstSocket.close).toHaveBeenCalled();
  });

  it("schedules reconnect after socket closes unexpectedly", async () => {
    const sockets: MockWebSocket[] = [];
    const client = makeMockClient(sockets);

    renderHook(() =>
      useWebSocketConnection({
        selectedId: "conv-1",
        client,
        getLastMessageId: vi.fn().mockReturnValue(null),
        onMessageRef: { current: vi.fn() },
        onResetTyping: vi.fn(),
      }),
    );

    // Wait for initial connection to be established
    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(0);
      expect(sockets[sockets.length - 1]?.send).toHaveBeenCalled();
    });

    const activeSocket = sockets[sockets.length - 1]!;
    const initialSocketCount = sockets.length;

    // Simulate unexpected close
    act(() => {
      activeSocket.trigger("close");
    });

    // The reconnect fires after the base 1 s delay — wait up to 3 s for a new connection.
    await waitFor(
      () => {
        expect(sockets.length).toBeGreaterThan(initialSocketCount);
      },
      { timeout: 3_000 },
    );
  }, 10_000);

  it("does not reconnect when conversationClosedRef is true", async () => {
    const sockets: MockWebSocket[] = [];
    const client = makeMockClient(sockets);

    const { result } = renderHook(() =>
      useWebSocketConnection({
        selectedId: "conv-1",
        client,
        getLastMessageId: vi.fn().mockReturnValue(null),
        onMessageRef: { current: vi.fn() },
        onResetTyping: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(0);
      expect(sockets[sockets.length - 1]?.send).toHaveBeenCalled();
    });

    const activeSocket = sockets[sockets.length - 1]!;
    const socketCountBeforeClose = sockets.length;

    result.current.conversationClosedRef.current = true;

    // Close the active socket — the handler checks conversationClosedRef synchronously
    // and skips scheduleReconnect, so no new socket should be created.
    act(() => {
      activeSocket.trigger("close");
    });

    expect(sockets.length).toBe(socketCountBeforeClose);
  });

  it("routes messages to onMessageRef.current", async () => {
    const sockets: MockWebSocket[] = [];
    const client = makeMockClient(sockets);
    const handler = vi.fn();

    renderHook(() =>
      useWebSocketConnection({
        selectedId: "conv-1",
        client,
        getLastMessageId: vi.fn().mockReturnValue(null),
        onMessageRef: { current: handler },
        onResetTyping: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(sockets.length).toBeGreaterThan(0);
      expect(sockets[sockets.length - 1]?.send).toHaveBeenCalled();
    });

    const event = new MessageEvent("message", { data: '{"type":"ping"}' });
    act(() => {
      sockets[sockets.length - 1]!.trigger("message", event);
    });

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not connect when selectedId is null", () => {
    const client = makeMockClient();

    renderHook(() =>
      useWebSocketConnection({
        selectedId: null,
        client,
        getLastMessageId: vi.fn().mockReturnValue(null),
        onMessageRef: { current: vi.fn() },
        onResetTyping: vi.fn(),
      }),
    );

    expect(client.getWsToken).not.toHaveBeenCalled();
  });

  it("exposes wsRef that points to the active WebSocket", async () => {
    const sockets: MockWebSocket[] = [];
    const client = makeMockClient(sockets);

    const { result } = renderHook(() =>
      useWebSocketConnection({
        selectedId: "conv-1",
        client,
        getLastMessageId: vi.fn().mockReturnValue(null),
        onMessageRef: { current: vi.fn() },
        onResetTyping: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.wsRef.current).not.toBeNull();
    });

    expect(result.current.wsRef.current).toBe(sockets[sockets.length - 1]);
  });
});
