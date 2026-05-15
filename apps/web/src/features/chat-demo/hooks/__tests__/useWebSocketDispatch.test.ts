import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocketDispatch } from "../useWebSocketDispatch";
import type { OptimisticMessage } from "../../lib/wsMessageReducer";
import type { Conversation } from "../../chat-client";

function makeMockWs() {
  return { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
}

function makeConversation(id: string, status = "active"): Conversation {
  return {
    id,
    status,
    subject: null,
    assignedTo: null,
    participants: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

function makeMessage(id: string, conversationId: string): OptimisticMessage {
  return {
    id,
    conversationId,
    senderId: "user-1",
    content: "hello",
    createdAt: "2024-01-01T00:00:00Z",
    editedAt: null,
  };
}

type HookOptions = Parameters<typeof useWebSocketDispatch>[0];

function renderDispatch(overrides: Partial<HookOptions> = {}) {
  const mockWs = makeMockWs();
  const wsRef = { current: mockWs as unknown as WebSocket };
  const conversationClosedRef = { current: false };
  const selectedIdRef = { current: "conv-1" };
  const setMessages = vi.fn();
  const setConversations = vi.fn();
  const setOperatorTypingName = vi.fn();
  const setLastMessageId = vi.fn();
  const onMarkAsRead = vi.fn();
  const refreshUnread = vi.fn().mockResolvedValue(undefined);

  const opts: HookOptions = {
    wsRef,
    conversationClosedRef,
    selectedIdRef,
    messages: [],
    conversations: [makeConversation("conv-1")],
    operatorTypingName: null,
    setMessages,
    setConversations,
    setOperatorTypingName,
    setLastMessageId,
    onMarkAsRead,
    refreshUnread,
    ...overrides,
  };

  const { result } = renderHook(() => useWebSocketDispatch(opts));

  return {
    result,
    mockWs,
    wsRef,
    conversationClosedRef,
    setMessages,
    setConversations,
    setOperatorTypingName,
    setLastMessageId,
    onMarkAsRead,
    refreshUnread,
  };
}

function dispatchEvent(
  handleWsMessage: (e: MessageEvent) => void,
  type: string,
  payload: unknown,
) {
  act(() => {
    handleWsMessage(
      new MessageEvent("message", { data: JSON.stringify({ type, payload }) }),
    );
  });
}

describe("useWebSocketDispatch", () => {
  it("calls setMessages when message:new arrives in selected conversation", () => {
    const { result, setMessages } = renderDispatch();

    dispatchEvent(result.current.handleWsMessage, "message:new", {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-2",
      content: "Hello!",
      createdAt: "2024-01-01T00:00:01Z",
    });

    expect(setMessages).toHaveBeenCalledOnce();
    const [newMessages] = setMessages.mock.calls[0] as [OptimisticMessage[]];
    expect(newMessages).toHaveLength(1);
    expect(newMessages[0].content).toBe("Hello!");
  });

  it("calls refreshUnread when message:new arrives in another conversation", async () => {
    const { result, refreshUnread } = renderDispatch();

    await act(async () => {
      dispatchEvent(result.current.handleWsMessage, "message:new", {
        id: "msg-2",
        conversationId: "conv-2",
        senderId: "user-2",
        content: "other conv",
        createdAt: "2024-01-01T00:00:01Z",
      });
      await Promise.resolve();
    });

    expect(refreshUnread).toHaveBeenCalledWith("conv-2");
  });

  it("closes socket and sets conversationClosedRef on conversation:resolved for selected conv", () => {
    const { result, mockWs, wsRef, conversationClosedRef } = renderDispatch();

    dispatchEvent(result.current.handleWsMessage, "conversation:resolved", {
      conversationId: "conv-1",
    });

    expect(mockWs.close).toHaveBeenCalledOnce();
    expect(wsRef.current).toBeNull();
    expect(conversationClosedRef.current).toBe(true);
  });

  it("does not close socket on conversation:resolved for a different conversation", () => {
    const { result, mockWs } = renderDispatch();

    dispatchEvent(result.current.handleWsMessage, "conversation:resolved", {
      conversationId: "conv-other",
    });

    expect(mockWs.close).not.toHaveBeenCalled();
  });

  it("calls setOperatorTypingName on typing:start", () => {
    const { result, setOperatorTypingName } = renderDispatch();

    dispatchEvent(result.current.handleWsMessage, "typing:start", {
      conversationId: "conv-1",
      userName: "Alice",
    });

    expect(setOperatorTypingName).toHaveBeenCalledWith("Alice");
  });

  it("calls setOperatorTypingName(null) on typing:stop", () => {
    const { result, setOperatorTypingName } = renderDispatch({
      operatorTypingName: "Alice",
    });

    dispatchEvent(result.current.handleWsMessage, "typing:stop", {
      conversationId: "conv-1",
    });

    expect(setOperatorTypingName).toHaveBeenCalledWith(null);
  });

  it("calls setMessages on message:ack replacing optimistic message", () => {
    const optimistic = makeMessage("client-id-1", "conv-1");
    optimistic.clientId = "client-1";
    optimistic.pending = true;

    const { result, setMessages } = renderDispatch({ messages: [optimistic] });

    dispatchEvent(result.current.handleWsMessage, "message:ack", {
      clientMessageId: "client-1",
      serverMessageId: "server-msg-1",
      createdAt: "2024-01-01T00:00:02Z",
    });

    expect(setMessages).toHaveBeenCalledOnce();
    const [newMessages] = setMessages.mock.calls[0] as [OptimisticMessage[]];
    expect(newMessages[0].id).toBe("server-msg-1");
    expect(newMessages[0].pending).toBe(false);
  });

  it("calls setConversations on conversation:accepted", () => {
    const { result, setConversations } = renderDispatch({
      conversations: [makeConversation("conv-1", "pending")],
    });

    dispatchEvent(result.current.handleWsMessage, "conversation:accepted", {
      conversationId: "conv-1",
      assignedTo: "operator-1",
    });

    expect(setConversations).toHaveBeenCalledOnce();
    const [newConvs] = setConversations.mock.calls[0] as [Conversation[]];
    expect(newConvs[0].status).toBe("active");
    expect(newConvs[0].assignedTo).toBe("operator-1");
  });

  it("calls onMarkAsRead when message:new arrives in selected conversation", () => {
    const { result, onMarkAsRead } = renderDispatch();

    dispatchEvent(result.current.handleWsMessage, "message:new", {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "user-2",
      content: "Hello!",
      createdAt: "2024-01-01T00:00:01Z",
    });

    expect(onMarkAsRead).toHaveBeenCalledWith("conv-1", "msg-1");
  });

  it("does nothing on malformed JSON", () => {
    const { result, setMessages } = renderDispatch();

    act(() => {
      result.current.handleWsMessage(
        new MessageEvent("message", { data: "not json" }),
      );
    });

    expect(setMessages).not.toHaveBeenCalled();
  });
});
