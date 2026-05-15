import { describe, it, expect, vi } from "vitest";
import { handleConversationLifecycle } from "./handleConversationLifecycle";
import type { WebSocketHandlerContext } from "../types/chat.types";

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

describe("handleConversationLifecycle", () => {
  it("calls invalidateQueries for conversation:new", () => {
    const ctx = createCtx();
    handleConversationLifecycle("conversation:new", ctx);
    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("calls invalidateQueries for conversation:accepted", () => {
    const ctx = createCtx();
    handleConversationLifecycle("conversation:accepted", ctx);
    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("calls invalidateQueries for conversation:released", () => {
    const ctx = createCtx();
    handleConversationLifecycle("conversation:released", ctx);
    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("calls invalidateQueries for conversation:resolved", () => {
    const ctx = createCtx();
    handleConversationLifecycle("conversation:resolved", ctx);
    expect(ctx.invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
