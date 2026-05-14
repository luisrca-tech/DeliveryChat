import { describe, it, expect, vi } from "vitest";
import { handleMessageDeleted } from "./handleMessageDeleted";
import type { MessageDeletedPayload } from "@repo/types";
import type { WebSocketHandlerContext } from "../types/chat.types";

function makePayload(overrides: Partial<MessageDeletedPayload> = {}): MessageDeletedPayload {
  return {
    conversationId: "conv-1",
    messageId: "msg-1",
    senderId: "user-1",
    ...overrides,
  };
}

function createCtx(overrides: Partial<WebSocketHandlerContext> = {}): WebSocketHandlerContext {
  return {
    activeConversationId: null,
    processedMsgIds: new Set(),
    messagesQueryKey: (id) => ["conversations", "messages", id, 50, 0] as const,
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMessagesCache(messages: Array<{ id: string; content: string; isDeleted?: boolean }>) {
  return { messages, limit: 50, offset: 0 };
}

describe("handleMessageDeleted", () => {
  it("marks the matching message as deleted and clears its content", () => {
    const ctx = createCtx();
    handleMessageDeleted(makePayload(), ctx);

    expect(ctx.setQueryData).toHaveBeenCalledTimes(1);
    const [key, updater] = (ctx.setQueryData as ReturnType<typeof vi.fn>).mock.calls[0]!;
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
    const ctx = createCtx();
    handleMessageDeleted(makePayload(), ctx);

    const updater = (ctx.setQueryData as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(updater(undefined)).toBeUndefined();
  });

  it("leaves messages unchanged when the message id is not found", () => {
    const ctx = createCtx();
    handleMessageDeleted(makePayload({ messageId: "nonexistent" }), ctx);

    const updater = (ctx.setQueryData as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    const old = makeMessagesCache([{ id: "msg-1", content: "original" }]);
    const result = updater(old);
    expect(result.messages[0]).toEqual({ id: "msg-1", content: "original" });
  });
});
