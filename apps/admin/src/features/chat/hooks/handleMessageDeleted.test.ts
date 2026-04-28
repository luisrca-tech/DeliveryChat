import { describe, it, expect, vi } from "vitest";
import { handleMessageDeleted } from "./handleMessageDeleted";
import type { MessageDeletedPayload } from "@repo/types";

function makePayload(overrides: Partial<MessageDeletedPayload> = {}): MessageDeletedPayload {
  return {
    conversationId: "conv-1",
    messageId: "msg-1",
    senderId: "user-1",
    ...overrides,
  };
}

function makeMessagesCache(messages: Array<{ id: string; content: string; isDeleted?: boolean }>) {
  return { messages, limit: 50, offset: 0 };
}

describe("handleMessageDeleted", () => {
  it("marks the matching message as deleted and clears its content", () => {
    const setQueryData = vi.fn();
    handleMessageDeleted(makePayload(), {
      messagesQueryKey: (id) => ["conversations", "messages", id, 50, 0],
      setQueryData,
    });

    expect(setQueryData).toHaveBeenCalledTimes(1);
    const [key, updater] = setQueryData.mock.calls[0]!;
    expect(key).toEqual(["conversations", "messages", "conv-1", 50, 0]);

    const old = makeMessagesCache([
      { id: "msg-1", content: "some text" },
      { id: "msg-2", content: "other" },
    ]);
    const result = updater(old);
    expect(result.messages[0]).toEqual({ id: "msg-1", content: "", isDeleted: true });
    expect(result.messages[1]).toEqual({ id: "msg-2", content: "other" });
  });

  it("returns the cache unchanged when it is undefined", () => {
    const setQueryData = vi.fn();
    handleMessageDeleted(makePayload(), {
      messagesQueryKey: (id) => ["conversations", "messages", id, 50, 0],
      setQueryData,
    });

    const updater = setQueryData.mock.calls[0]![1];
    expect(updater(undefined)).toBeUndefined();
  });

  it("leaves messages unchanged when the message id is not found", () => {
    const setQueryData = vi.fn();
    handleMessageDeleted(makePayload({ messageId: "nonexistent" }), {
      messagesQueryKey: (id) => ["conversations", "messages", id, 50, 0],
      setQueryData,
    });

    const updater = setQueryData.mock.calls[0]![1];
    const old = makeMessagesCache([{ id: "msg-1", content: "original" }]);
    const result = updater(old);
    expect(result.messages[0]).toEqual({ id: "msg-1", content: "original" });
  });
});
