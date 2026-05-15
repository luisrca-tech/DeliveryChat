import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useMessageInput } from "../useMessageInput";
import type { OptimisticMessage } from "../../lib/wsMessageReducer";

function makeWsRef(readyState = WebSocket.OPEN) {
  return { current: { readyState, send: vi.fn() } as unknown as WebSocket };
}

describe("useMessageInput", () => {
  let onAppend: ReturnType<typeof vi.fn>;
  let onRollback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onAppend = vi.fn();
    onRollback = vi.fn();
  });

  it("starts with empty value, not sending, no error", () => {
    const wsRef = { current: null };
    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );
    expect(result.current.value).toBe("");
    expect(result.current.sending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("updates value on handleInputChange", () => {
    const wsRef = { current: null };
    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: "hello" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.value).toBe("hello");
  });

  it("calls onAppend with an optimistic message and sends via WebSocket", async () => {
    const ws = { readyState: WebSocket.OPEN, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: "Hello world" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(onAppend).toHaveBeenCalledOnce();
    const appended = onAppend.mock.calls[0][0] as OptimisticMessage;
    expect(appended.content).toBe("Hello world");
    expect(appended.pending).toBe(true);
    expect(ws.send).toHaveBeenCalledOnce();
    expect(result.current.value).toBe("");
  });

  it("sets error and does not send when WebSocket is not open", async () => {
    const ws = { readyState: WebSocket.CLOSED, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: "Hello" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(result.current.error).not.toBeNull();
    expect(onAppend).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("rolls back optimistic message if send throws", async () => {
    const ws = {
      readyState: WebSocket.OPEN,
      send: vi.fn().mockImplementation(() => {
        throw new Error("send failed");
      }),
    };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: "Hello" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(onAppend).toHaveBeenCalled();
    expect(onRollback).toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });

  it("does nothing when value is empty", async () => {
    const ws = { readyState: WebSocket.OPEN, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    await act(async () => {
      await result.current.handleSend();
    });

    expect(onAppend).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
  });
});
