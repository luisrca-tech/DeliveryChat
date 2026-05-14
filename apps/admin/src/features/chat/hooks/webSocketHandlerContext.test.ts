import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WebSocketHandlerContext } from "../types/chat.types";
import type { MessageNewPayload, MessageEditedPayload, MessageDeletedPayload } from "@repo/types";
import { handleMessageNew } from "./handleMessageNew";
import { handleMessageEdited } from "./handleMessageEdited";
import { handleMessageDeleted } from "./handleMessageDeleted";
import { handleConversationLifecycle } from "./handleConversationLifecycle";

function createMockContext(
  overrides: Partial<WebSocketHandlerContext> = {},
): WebSocketHandlerContext {
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

describe("WebSocketHandlerContext", () => {
  let ctx: WebSocketHandlerContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it("works as the sole dependency for handleMessageNew", () => {
    const payload: MessageNewPayload = {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "visitor-1",
      senderName: "Visitor",
      senderRole: "visitor",
      content: "hello",
      type: "text",
      createdAt: new Date().toISOString(),
    };

    const result = handleMessageNew(payload, ctx);

    expect(result).toEqual({ clearTypingForSender: true });
    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("works as the sole dependency for handleMessageEdited", () => {
    const payload: MessageEditedPayload = {
      conversationId: "conv-1",
      messageId: "msg-1",
      content: "edited",
      editedAt: "2026-01-01T02:00:00Z",
      senderId: "user-1",
    };

    handleMessageEdited(payload, ctx);

    expect(ctx.setQueryData).toHaveBeenCalledTimes(1);
  });

  it("works as the sole dependency for handleMessageDeleted", () => {
    const payload: MessageDeletedPayload = {
      conversationId: "conv-1",
      messageId: "msg-1",
      senderId: "user-1",
    };

    handleMessageDeleted(payload, ctx);

    expect(ctx.setQueryData).toHaveBeenCalledTimes(1);
  });

  it("works as the sole dependency for handleConversationLifecycle", () => {
    handleConversationLifecycle("conversation:new", ctx);

    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
