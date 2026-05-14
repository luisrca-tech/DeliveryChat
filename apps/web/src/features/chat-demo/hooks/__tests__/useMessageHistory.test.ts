import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMessageHistory } from "../useMessageHistory";
import type { ChatClient } from "../../chat-client";
import type { OptimisticMessage } from "../../lib/wsMessageReducer";

function makeMsg(id: string, clientId?: string): OptimisticMessage {
  return {
    id,
    conversationId: "conv-1",
    senderId: "user-1",
    content: `Message ${id}`,
    createdAt: new Date().toISOString(),
    editedAt: null,
    ...(clientId ? { clientId, pending: false } : {}),
  };
}

function makeClient(overrides: Partial<ChatClient> = {}): ChatClient {
  return {
    getMessages: vi.fn().mockResolvedValue({ messages: [], limit: 20, offset: 0 }),
    markAsRead: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  } as unknown as ChatClient;
}

describe("useMessageHistory", () => {
  let setLastMessageId: (conversationId: string, messageId: string) => void;
  let clearUnread: (conversationId: string) => void;

  beforeEach(() => {
    setLastMessageId = vi.fn() as unknown as (conversationId: string, messageId: string) => void;
    clearUnread = vi.fn() as unknown as (conversationId: string) => void;
  });

  it("does not fetch when selectedId is null", () => {
    const client = makeClient();
    renderHook(() =>
      useMessageHistory({ selectedId: null, client, setLastMessageId, clearUnread }),
    );
    expect(client.getMessages).not.toHaveBeenCalled();
  });

  it("fetches and reverses messages when selectedId is set", async () => {
    const msgs = [makeMsg("msg-1"), makeMsg("msg-2")];
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue({ messages: msgs, limit: 20, offset: 0 }),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    // API returns newest-first; hook reverses to oldest-first
    expect(result.current.messages[0].id).toBe("msg-2");
    expect(result.current.messages[1].id).toBe("msg-1");
  });

  it("calls setLastMessageId with the last message id after reversing", async () => {
    const msgs = [makeMsg("msg-1"), makeMsg("msg-2")];
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue({ messages: msgs, limit: 20, offset: 0 }),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    // After reversing, msg-1 is last (oldest) — should be persisted as the last seen
    expect(setLastMessageId).toHaveBeenCalledWith("conv-1", "msg-1");
  });

  it("calls clearUnread after a successful fetch", async () => {
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue({ messages: [], limit: 20, offset: 0 }),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    expect(clearUnread).toHaveBeenCalledWith("conv-1");
  });

  it("sets loadingMsgs false even when fetch fails", async () => {
    const client = makeClient({
      getMessages: vi.fn().mockRejectedValue(new Error("Network error")),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    expect(result.current.messages).toEqual([]);
  });

  it("refetches when selectedId changes", async () => {
    const getMessages = vi
      .fn()
      .mockResolvedValueOnce({ messages: [makeMsg("msg-a")], limit: 20, offset: 0 })
      .mockResolvedValueOnce({ messages: [makeMsg("msg-b")], limit: 20, offset: 0 });
    const client = makeClient({ getMessages });

    const { result, rerender } = renderHook(
      ({ id }) => useMessageHistory({ selectedId: id, client, setLastMessageId, clearUnread }),
      { initialProps: { id: "conv-1" } },
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));
    expect(result.current.messages[0].id).toBe("msg-a");

    rerender({ id: "conv-2" });

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));
    expect(result.current.messages[0].id).toBe("msg-b");
  });

  it("appendMessage adds to the end of the list", async () => {
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue({ messages: [makeMsg("msg-1")], limit: 20, offset: 0 }),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    act(() => result.current.appendMessage(makeMsg("msg-2")));

    expect(result.current.messages[result.current.messages.length - 1].id).toBe("msg-2");
  });

  it("replaceMessage updates content and editedAt by id", async () => {
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue({ messages: [makeMsg("msg-1")], limit: 20, offset: 0 }),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    act(() => result.current.replaceMessage("msg-1", "Updated content", "2024-01-01T00:00:00Z"));

    expect(result.current.messages[0].content).toBe("Updated content");
    expect(result.current.messages[0].editedAt).toBe("2024-01-01T00:00:00Z");
  });

  it("removeMessage removes the message by id", async () => {
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue({
        messages: [makeMsg("msg-1"), makeMsg("msg-2")],
        limit: 20,
        offset: 0,
      }),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    act(() => result.current.removeMessage("msg-2"));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe("msg-1");
  });

  it("rollbackMessage removes an optimistic message by clientId", async () => {
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue({ messages: [], limit: 20, offset: 0 }),
    });

    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: "conv-1", client, setLastMessageId, clearUnread }),
    );

    await waitFor(() => expect(result.current.loadingMsgs).toBe(false));

    act(() => result.current.appendMessage(makeMsg("temp", "client-1")));
    act(() => result.current.rollbackMessage("client-1"));

    expect(result.current.messages).toHaveLength(0);
  });

  it("exposes messagesEndRef for scroll attachment", () => {
    const client = makeClient();
    const { result } = renderHook(() =>
      useMessageHistory({ selectedId: null, client, setLastMessageId, clearUnread }),
    );
    expect(result.current.messagesEndRef).toBeDefined();
    expect(result.current.messagesEndRef.current).toBeNull();
  });
});
