import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocketHeartbeat } from "../useWebSocketHeartbeat";

const HEARTBEAT_MS = 30_000;

function makeMockWs(readyState: number = WebSocket.OPEN) {
  const ws = { readyState, send: vi.fn() };
  return {
    ws,
    wsRef: { current: ws as unknown as WebSocket },
  };
}

describe("useWebSocketHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends ping every 30 s while socket is open", () => {
    const { ws, wsRef } = makeMockWs();
    const { result } = renderHook(() => useWebSocketHeartbeat());

    act(() => {
      result.current.startHeartbeat(wsRef);
    });

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS);
    });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(
      (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
    );
    expect(sent.type).toBe("ping");

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS);
    });
    expect(ws.send).toHaveBeenCalledTimes(2);
  });

  it("does not send ping after stopHeartbeat", () => {
    const { ws, wsRef } = makeMockWs();
    const { result } = renderHook(() => useWebSocketHeartbeat());

    act(() => {
      result.current.startHeartbeat(wsRef);
      result.current.stopHeartbeat();
    });

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("does not send ping when socket is not open", () => {
    const { ws, wsRef } = makeMockWs(WebSocket.CLOSED);
    const { result } = renderHook(() => useWebSocketHeartbeat());

    act(() => {
      result.current.startHeartbeat(wsRef);
    });

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("restarts heartbeat when startHeartbeat is called again", () => {
    const { ws: ws1, wsRef: wsRef1 } = makeMockWs();
    const { ws: ws2, wsRef: wsRef2 } = makeMockWs();
    const { result } = renderHook(() => useWebSocketHeartbeat());

    act(() => {
      result.current.startHeartbeat(wsRef1);
      result.current.startHeartbeat(wsRef2);
    });

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS);
    });

    expect(ws1.send).not.toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });
});
