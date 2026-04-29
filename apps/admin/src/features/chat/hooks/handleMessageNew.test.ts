import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessageNew } from "./handleMessageNew";
import type { MessageNewPayload } from "@repo/types";

function makePayload(overrides: Partial<MessageNewPayload> = {}): MessageNewPayload {
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

describe("handleMessageNew", () => {
  let invalidateQueries: ReturnType<typeof vi.fn>;
  let setQueryData: ReturnType<typeof vi.fn>;
  let markAsRead: ReturnType<typeof vi.fn>;
  let processedIds: Set<string>;
  const messagesQueryKey = (conversationId: string) =>
    ["conversations", "messages", conversationId, 50, 0] as const;

  beforeEach(() => {
    invalidateQueries = vi.fn();
    setQueryData = vi.fn();
    markAsRead = vi.fn().mockResolvedValue(undefined);
    processedIds = new Set();
  });

  it("fires invalidateQueries immediately for a visitor message in the active conversation", () => {
    const payload = makePayload({ senderRole: "visitor", conversationId: "conv-1" });

    handleMessageNew(payload, {
      activeConversationId: "conv-1",
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("fires markAsRead as fire-and-forget for a visitor message in the active conversation", () => {
    const payload = makePayload({ senderRole: "visitor", conversationId: "conv-1" });

    handleMessageNew(payload, {
      activeConversationId: "conv-1",
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    expect(markAsRead).toHaveBeenCalledWith("conv-1");
  });

  it("does not chain invalidateQueries inside markAsRead.then()", async () => {
    let resolveMarkAsRead!: () => void;
    markAsRead.mockReturnValue(new Promise<void>((r) => { resolveMarkAsRead = r; }));

    const payload = makePayload({ senderRole: "visitor", conversationId: "conv-1" });

    handleMessageNew(payload, {
      activeConversationId: "conv-1",
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);

    resolveMarkAsRead();
    await Promise.resolve();

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("fires invalidateQueries for messages in non-active conversations", () => {
    const payload = makePayload({ conversationId: "conv-2" });

    handleMessageNew(payload, {
      activeConversationId: "conv-1",
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it("does not call markAsRead for operator messages in the active conversation", () => {
    const payload = makePayload({ senderRole: "operator", conversationId: "conv-1" });

    handleMessageNew(payload, {
      activeConversationId: "conv-1",
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it("deduplicates messages by id", () => {
    const payload = makePayload({ id: "msg-dup" });

    handleMessageNew(payload, {
      activeConversationId: null,
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    handleMessageNew(payload, {
      activeConversationId: null,
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(setQueryData).toHaveBeenCalledTimes(1);
  });

  it("updates the messages cache via setQueryData", () => {
    const payload = makePayload();

    handleMessageNew(payload, {
      activeConversationId: null,
      processedMsgIds: processedIds,
      messagesQueryKey,
      invalidateQueries,
      setQueryData,
      markAsRead,
    });

    expect(setQueryData).toHaveBeenCalledTimes(1);
    expect(setQueryData).toHaveBeenCalledWith(
      expect.arrayContaining(["conversations", "messages", payload.conversationId]),
      expect.any(Function),
    );
  });
});
