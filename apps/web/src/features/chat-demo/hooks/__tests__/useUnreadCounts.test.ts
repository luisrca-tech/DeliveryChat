import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnreadCounts } from "../useUnreadCounts";
import type { ChatClient } from "../../chat-client";

function makeClient(overrides: Partial<ChatClient> = {}): ChatClient {
  return {
    getUnreadCount: vi.fn().mockResolvedValue({ unreadCount: 3 }),
    ...overrides,
  } as unknown as ChatClient;
}

describe("useUnreadCounts", () => {
  it("starts with empty unread counts", () => {
    const client = makeClient();
    const { result } = renderHook(() => useUnreadCounts(client));
    expect(result.current.unreadCounts).toEqual({});
  });

  it("clears unread count for a conversation on open", () => {
    const client = makeClient();
    const { result } = renderHook(() => useUnreadCounts(client));

    act(() => {
      result.current.setUnreadCounts({ "conv-1": 5, "conv-2": 2 });
    });

    act(() => {
      result.current.clearUnread("conv-1");
    });

    expect(result.current.unreadCounts["conv-1"]).toBe(0);
    expect(result.current.unreadCounts["conv-2"]).toBe(2);
  });

  it("increments unread count after refreshUnread resolves", async () => {
    const client = makeClient({ getUnreadCount: vi.fn().mockResolvedValue({ unreadCount: 7 }) });
    const { result } = renderHook(() => useUnreadCounts(client));

    await act(async () => {
      await result.current.refreshUnread("conv-1");
    });

    expect(result.current.unreadCounts["conv-1"]).toBe(7);
  });

  it("does not throw if getUnreadCount rejects", async () => {
    const client = makeClient({ getUnreadCount: vi.fn().mockRejectedValue(new Error("network error")) });
    const { result } = renderHook(() => useUnreadCounts(client));

    await expect(
      act(async () => {
        await result.current.refreshUnread("conv-1");
      }),
    ).resolves.not.toThrow();
  });
});
