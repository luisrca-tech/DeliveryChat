import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  trackPendingMessage,
  resolvePendingMessage,
  rejectPendingMessage,
  clearAllPending,
} from "./PendingMessages.js";
import type { ChatMessage } from "./types/index.js";

function makeSentMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "server-msg-1",
    content: "hello",
    type: "text",
    senderRole: "visitor",
    senderId: "visitor-1",
    status: "sent",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("PendingMessages", () => {
  beforeEach(() => {
    clearAllPending();
  });

  it("resolves when resolvePendingMessage is called", async () => {
    const msg = makeSentMessage();
    const promise = trackPendingMessage("client-1");
    resolvePendingMessage("client-1", msg);
    await expect(promise).resolves.toBe(msg);
  });

  it("rejects when rejectPendingMessage is called", async () => {
    const promise = trackPendingMessage("client-2");
    rejectPendingMessage("client-2", new Error("Rate limited"));
    await expect(promise).rejects.toThrow("Rate limited");
  });

  it("ignores resolve for unknown clientMessageId", () => {
    const msg = makeSentMessage();
    expect(() => resolvePendingMessage("unknown", msg)).not.toThrow();
  });

  it("ignores reject for unknown clientMessageId", () => {
    expect(() =>
      rejectPendingMessage("unknown", new Error("test")),
    ).not.toThrow();
  });

  it("rejects with timeout when no ACK arrives", async () => {
    vi.useFakeTimers();
    const promise = trackPendingMessage("client-3");
    vi.advanceTimersByTime(15_000);
    await expect(promise).rejects.toThrow("timed out");
    vi.useRealTimers();
  });

  it("clearAllPending rejects all tracked promises", async () => {
    const p1 = trackPendingMessage("client-a");
    const p2 = trackPendingMessage("client-b");
    clearAllPending();
    await expect(p1).rejects.toThrow("destroyed");
    await expect(p2).rejects.toThrow("destroyed");
  });

  it("does not resolve twice after timeout fires", async () => {
    vi.useFakeTimers();
    const msg = makeSentMessage();
    const promise = trackPendingMessage("client-4");
    resolvePendingMessage("client-4", msg);
    vi.advanceTimersByTime(15_000);
    await expect(promise).resolves.toBe(msg);
    vi.useRealTimers();
  });
});
