import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMessageEdit } from "../useMessageEdit";
import type { ChatClient } from "../../chat-client";
import type { OptimisticMessage } from "../../lib/wsMessageReducer";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

function makeMessage(overrides: Partial<OptimisticMessage> = {}): OptimisticMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-1",
    content: "Hello",
    createdAt: new Date().toISOString(),
    editedAt: null,
    ...overrides,
  };
}

function makeClient(overrides: Partial<ChatClient> = {}): ChatClient {
  return {
    editMessage: vi.fn().mockResolvedValue({
      message: { content: "Updated", editedAt: new Date().toISOString() },
    }),
    deleteMessage: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  } as unknown as ChatClient;
}

describe("useMessageEdit", () => {
  let onReplace: ReturnType<typeof vi.fn>;
  let onRemove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onReplace = vi.fn();
    onRemove = vi.fn();
  });

  it("starts with no active editing state", () => {
    const client = makeClient();
    const { result } = renderHook(() => useMessageEdit(client, onReplace, onRemove));
    expect(result.current.editingState).toBeNull();
  });

  it("enters edit mode with the message content when handleStartEdit is called", () => {
    const client = makeClient();
    const msg = makeMessage();
    const { result } = renderHook(() => useMessageEdit(client, onReplace, onRemove));

    act(() => {
      result.current.handleStartEdit(msg);
    });

    expect(result.current.editingState).toMatchObject({ id: "msg-1", content: "Hello", saving: false });
  });

  it("clears editing state on handleCancelEdit", () => {
    const client = makeClient();
    const msg = makeMessage();
    const { result } = renderHook(() => useMessageEdit(client, onReplace, onRemove));

    act(() => {
      result.current.handleStartEdit(msg);
    });
    act(() => {
      result.current.handleCancelEdit();
    });

    expect(result.current.editingState).toBeNull();
  });

  it("calls onReplace and clears state on successful save", async () => {
    const updatedAt = new Date().toISOString();
    const client = makeClient({
      editMessage: vi.fn().mockResolvedValue({ message: { content: "Updated", editedAt: updatedAt } }),
    });
    const msg = makeMessage();
    const { result } = renderHook(() => useMessageEdit(client, onReplace, onRemove));

    act(() => {
      result.current.handleStartEdit(msg);
      result.current.setEditingContent("Updated");
    });

    await act(async () => {
      await result.current.handleSaveEdit(msg);
    });

    expect(onReplace).toHaveBeenCalledWith("msg-1", "Updated", updatedAt);
    expect(result.current.editingState).toBeNull();
  });

  it("denies edit (no-op) when message is beyond the 15-minute window", async () => {
    const client = makeClient();
    const oldMessage = makeMessage({
      createdAt: new Date(Date.now() - EDIT_WINDOW_MS - 1).toISOString(),
    });
    const { result } = renderHook(() => useMessageEdit(client, onReplace, onRemove));

    act(() => {
      result.current.handleStartEdit(oldMessage);
      result.current.setEditingContent("New content");
    });

    await act(async () => {
      await result.current.handleSaveEdit(oldMessage);
    });

    expect(client.editMessage).not.toHaveBeenCalled();
    expect(result.current.editingState).toBeNull();
  });

  it("allows edit when message is just within the 15-minute window", async () => {
    const updatedAt = new Date().toISOString();
    const client = makeClient({
      editMessage: vi.fn().mockResolvedValue({ message: { content: "New", editedAt: updatedAt } }),
    });
    const recentMessage = makeMessage({
      createdAt: new Date(Date.now() - EDIT_WINDOW_MS + 5000).toISOString(),
    });
    const { result } = renderHook(() => useMessageEdit(client, onReplace, onRemove));

    act(() => {
      result.current.handleStartEdit(recentMessage);
      result.current.setEditingContent("New");
    });

    await act(async () => {
      await result.current.handleSaveEdit(recentMessage);
    });

    expect(client.editMessage).toHaveBeenCalled();
  });

  it("calls onRemove and clears state on successful delete", async () => {
    const client = makeClient();
    const msg = makeMessage();
    const { result } = renderHook(() => useMessageEdit(client, onReplace, onRemove));

    await act(async () => {
      await result.current.handleDelete(msg);
    });

    expect(onRemove).toHaveBeenCalledWith("msg-1");
  });
});
