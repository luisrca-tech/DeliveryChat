import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTypingIndicator } from "../useTypingIndicator";

const TYPING_DEBOUNCE_MS = 1500;

function makeMockWs() {
  const ws = { readyState: WebSocket.OPEN, send: vi.fn() };
  return { current: ws as unknown as WebSocket };
}

describe("useTypingIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends typing:start on the first call to notifyTyping", () => {
    const wsRef = makeMockWs();
    const { result } = renderHook(() => useTypingIndicator(wsRef, "conv-1"));

    act(() => {
      result.current.notifyTyping();
    });

    expect(wsRef.current?.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(
      (wsRef.current?.send as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string,
    );
    expect(sent.type).toBe("typing:start");
    expect(sent.payload.conversationId).toBe("conv-1");
  });

  it("does not send typing:start again on subsequent calls before debounce", () => {
    const wsRef = makeMockWs();
    const { result } = renderHook(() => useTypingIndicator(wsRef, "conv-1"));

    act(() => {
      result.current.notifyTyping();
      result.current.notifyTyping();
      result.current.notifyTyping();
    });

    const calls = (
      wsRef.current?.send as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => JSON.parse(c[0] as string).type === "typing:start",
    );
    expect(calls).toHaveLength(1);
  });

  it("sends typing:stop after debounce timeout", () => {
    const wsRef = makeMockWs();
    const { result } = renderHook(() => useTypingIndicator(wsRef, "conv-1"));

    act(() => {
      result.current.notifyTyping();
    });

    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });

    const stopCalls = (
      wsRef.current?.send as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => JSON.parse(c[0] as string).type === "typing:stop",
    );
    expect(stopCalls).toHaveLength(1);
  });

  it("sends typing:stop immediately when sendTypingStop is called", () => {
    const wsRef = makeMockWs();
    const { result } = renderHook(() => useTypingIndicator(wsRef, "conv-1"));

    act(() => {
      result.current.notifyTyping();
    });

    act(() => {
      result.current.sendTypingStop();
    });

    const stopCalls = (
      wsRef.current?.send as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => JSON.parse(c[0] as string).type === "typing:stop",
    );
    expect(stopCalls).toHaveLength(1);
  });

  it("resets after typing:stop so next keystroke sends typing:start again", () => {
    const wsRef = makeMockWs();
    const { result } = renderHook(() => useTypingIndicator(wsRef, "conv-1"));

    act(() => {
      result.current.notifyTyping();
    });
    act(() => {
      result.current.sendTypingStop();
    });
    act(() => {
      result.current.notifyTyping();
    });

    const startCalls = (
      wsRef.current?.send as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => JSON.parse(c[0] as string).type === "typing:start",
    );
    expect(startCalls).toHaveLength(2);
  });

  it("does not send when WebSocket is not open", () => {
    const ws = { readyState: WebSocket.CLOSED, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };
    const { result } = renderHook(() => useTypingIndicator(wsRef, "conv-1"));

    act(() => {
      result.current.notifyTyping();
    });

    expect(ws.send).not.toHaveBeenCalled();
  });
});
