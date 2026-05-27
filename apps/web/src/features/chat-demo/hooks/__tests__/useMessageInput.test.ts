import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMessageInput } from "../useMessageInput";
import type { OptimisticMessage } from "../../lib/wsMessageReducer";

vi.mock("../../components/lexical", () => ({
  serializeLexicalJsonToHtml: (json: string) => `<p>html:${json}</p>`,
}));

describe("useMessageInput", () => {
  let onAppend: (msg: OptimisticMessage) => void;
  let onRollback: (clientId: string) => void;

  beforeEach(() => {
    onAppend = vi.fn();
    onRollback = vi.fn();
  });

  it("starts not sending with no error", () => {
    const wsRef = { current: null };
    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );
    expect(result.current.sending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sends plain text message via WebSocket with contentFormat plain", () => {
    const ws = { readyState: WebSocket.OPEN, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleSend("Hello world", "plain");
    });

    expect(onAppend).toHaveBeenCalledOnce();
    const appended = (onAppend as ReturnType<typeof vi.fn>).mock.calls[0][0] as OptimisticMessage;
    expect(appended.content).toBe("Hello world");
    expect(appended.contentFormat).toBe("plain");
    expect(appended.contentHtml).toBeNull();
    expect(appended.pending).toBe(true);
    expect(ws.send).toHaveBeenCalledOnce();

    const payload = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(payload.payload.contentFormat).toBe("plain");
  });

  it("sends lexical message with contentHtml computed client-side", () => {
    const ws = { readyState: WebSocket.OPEN, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleSend('{"root":{}}', "lexical");
    });

    expect(onAppend).toHaveBeenCalledOnce();
    const appended = (onAppend as ReturnType<typeof vi.fn>).mock.calls[0][0] as OptimisticMessage;
    expect(appended.contentFormat).toBe("lexical");
    expect(appended.contentHtml).toBe('<p>html:{"root":{}}</p>');

    const payload = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(payload.payload.contentFormat).toBe("lexical");
  });

  it("sets error when WebSocket is not open", () => {
    const ws = { readyState: WebSocket.CLOSED, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleSend("Hello", "plain");
    });

    expect(result.current.error).not.toBeNull();
    expect(onAppend).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("rolls back optimistic message if send throws", () => {
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
      result.current.handleSend("Hello", "plain");
    });

    expect(onAppend).toHaveBeenCalled();
    expect(onRollback).toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });

  it("does nothing when content is empty", () => {
    const ws = { readyState: WebSocket.OPEN, send: vi.fn() };
    const wsRef = { current: ws as unknown as WebSocket };

    const { result } = renderHook(() =>
      useMessageInput(wsRef, "conv-1", "user-1", onAppend, onRollback),
    );

    act(() => {
      result.current.handleSend("   ", "plain");
    });

    expect(onAppend).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalled();
  });
});
