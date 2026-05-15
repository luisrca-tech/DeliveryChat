import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessageNew } from "./handleMessageNew";
import type { MessageNewPayload } from "@repo/types";
import type { WebSocketHandlerContext } from "../types/chat.types";

function makePayload(
  overrides: Partial<MessageNewPayload> = {},
): MessageNewPayload {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "visitor-1",
    senderName: "Visitor",
    senderRole: "visitor",
    content: "hello",
    type: "text",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createCtx(
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

describe("handleMessageNew", () => {
  let ctx: WebSocketHandlerContext;

  beforeEach(() => {
    ctx = createCtx({ activeConversationId: "conv-1" });
  });

  it("fires invalidateQueries immediately for a visitor message in the active conversation", () => {
    const payload = makePayload({
      senderRole: "visitor",
      conversationId: "conv-1",
    });

    handleMessageNew(payload, ctx);

    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("fires markAsRead as fire-and-forget for a visitor message in the active conversation", () => {
    const payload = makePayload({
      senderRole: "visitor",
      conversationId: "conv-1",
    });

    handleMessageNew(payload, ctx);

    expect(ctx.markAsRead).toHaveBeenCalledWith("conv-1");
  });

  it("does not chain invalidateQueries inside markAsRead.then()", async () => {
    let resolveMarkAsRead!: () => void;
    const markAsRead = vi.fn().mockReturnValue(
      new Promise<void>((r) => {
        resolveMarkAsRead = r;
      }),
    );
    ctx = createCtx({ activeConversationId: "conv-1", markAsRead });

    const payload = makePayload({
      senderRole: "visitor",
      conversationId: "conv-1",
    });

    handleMessageNew(payload, ctx);

    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);

    resolveMarkAsRead();
    await Promise.resolve();

    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("fires invalidateQueries for messages in non-active conversations", () => {
    ctx = createCtx({ activeConversationId: "conv-1" });
    const payload = makePayload({ conversationId: "conv-2" });

    handleMessageNew(payload, ctx);

    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(ctx.markAsRead).not.toHaveBeenCalled();
  });

  it("does not call markAsRead for operator messages in the active conversation", () => {
    const payload = makePayload({
      senderRole: "operator",
      conversationId: "conv-1",
    });

    handleMessageNew(payload, ctx);

    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(ctx.markAsRead).not.toHaveBeenCalled();
  });

  it("deduplicates messages by id", () => {
    ctx = createCtx();
    const payload = makePayload({ id: "msg-dup" });

    handleMessageNew(payload, ctx);
    handleMessageNew(payload, ctx);

    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(ctx.setQueryData).toHaveBeenCalledTimes(1);
  });

  it("updates the messages cache via setQueryData", () => {
    ctx = createCtx();
    const payload = makePayload();

    handleMessageNew(payload, ctx);

    expect(ctx.setQueryData).toHaveBeenCalledTimes(1);
    expect(ctx.setQueryData).toHaveBeenCalledWith(
      expect.arrayContaining([
        "conversations",
        "messages",
        payload.conversationId,
      ]),
      expect.any(Function),
    );
  });
});
