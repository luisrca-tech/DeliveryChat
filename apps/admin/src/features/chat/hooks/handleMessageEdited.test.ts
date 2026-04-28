import { describe, it, expect, vi } from "vitest";
import { handleMessageEdited } from "./handleMessageEdited";
import type { MessageEditedPayload } from "@repo/types";

function makePayload(overrides: Partial<MessageEditedPayload> = {}): MessageEditedPayload {
  return {
    conversationId: "conv-1",
    messageId: "msg-1",
    content: "edited content",
    editedAt: "2026-01-01T02:00:00Z",
    senderId: "user-1",
    ...overrides,
  };
}

function makeMessagesCache(messages: Array<{ id: string; content: string; editedAt: string | null }>) {
  return { messages, limit: 50, offset: 0 };
}

describe("handleMessageEdited", () => {
  it("updates the matching message's content and editedAt in the cache", () => {
    const setQueryData = vi.fn();
    const payload = makePayload();

    handleMessageEdited(payload, {
      messagesQueryKey: (id) => ["conversations", "messages", id, 50, 0],
      setQueryData,
    });

    expect(setQueryData).toHaveBeenCalledTimes(1);
    const [key, updater] = setQueryData.mock.calls[0]!;
    expect(key).toEqual(["conversations", "messages", "conv-1", 50, 0]);

    const old = makeMessagesCache([
      { id: "msg-1", content: "original", editedAt: null },
      { id: "msg-2", content: "other", editedAt: null },
    ]);
    const result = updater(old);
    expect(result.messages[0]).toEqual({ id: "msg-1", content: "edited content", editedAt: "2026-01-01T02:00:00Z" });
    expect(result.messages[1]).toEqual({ id: "msg-2", content: "other", editedAt: null });
  });

  it("returns the cache unchanged when it is undefined", () => {
    const setQueryData = vi.fn();
    handleMessageEdited(makePayload(), {
      messagesQueryKey: (id) => ["conversations", "messages", id, 50, 0],
      setQueryData,
    });

    const updater = setQueryData.mock.calls[0]![1];
    expect(updater(undefined)).toBeUndefined();
  });

  it("leaves messages unchanged when the message id is not found", () => {
    const setQueryData = vi.fn();
    handleMessageEdited(makePayload({ messageId: "nonexistent" }), {
      messagesQueryKey: (id) => ["conversations", "messages", id, 50, 0],
      setQueryData,
    });

    const updater = setQueryData.mock.calls[0]![1];
    const old = makeMessagesCache([{ id: "msg-1", content: "original", editedAt: null }]);
    const result = updater(old);
    expect(result.messages[0]).toEqual({ id: "msg-1", content: "original", editedAt: null });
  });
});
