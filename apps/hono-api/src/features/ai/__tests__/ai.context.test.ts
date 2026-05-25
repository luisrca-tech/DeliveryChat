import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildContext,
  buildSystemPrompt,
  type ConversationMessage,
} from "../ai.context.js";

describe("buildContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const operatorId = "operator-1";

  it("formats a customer message with relative time", () => {
    const messages: ConversationMessage[] = [
      {
        senderId: "visitor-1",
        content: "I need help with my order",
        createdAt: "2026-05-25T11:55:00Z",
      },
    ];

    const result = buildContext(messages, operatorId);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
    expect(result[0]!.content).toBe("[Customer, 5min ago] I need help with my order");
  });

  it("formats an operator message with role prefix", () => {
    const messages: ConversationMessage[] = [
      {
        senderId: "operator-1",
        content: "Let me check that for you",
        createdAt: "2026-05-25T11:58:00Z",
      },
    ];

    const result = buildContext(messages, operatorId);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("assistant");
    expect(result[0]!.content).toBe(
      "[Operator, 2min ago] Let me check that for you",
    );
  });

  it("handles messages from just now (0min)", () => {
    const messages: ConversationMessage[] = [
      {
        senderId: "visitor-1",
        content: "Hello",
        createdAt: "2026-05-25T12:00:00Z",
      },
    ];

    const result = buildContext(messages, operatorId);
    expect(result[0]!.content).toContain("0min ago");
  });

  it("preserves message order", () => {
    const messages: ConversationMessage[] = [
      {
        senderId: "visitor-1",
        content: "Help me",
        createdAt: "2026-05-25T11:50:00Z",
      },
      {
        senderId: "operator-1",
        content: "Sure",
        createdAt: "2026-05-25T11:51:00Z",
      },
      {
        senderId: "visitor-1",
        content: "Thanks",
        createdAt: "2026-05-25T11:52:00Z",
      },
    ];

    const result = buildContext(messages, operatorId);

    expect(result).toHaveLength(3);
    expect(result[0]!.role).toBe("user");
    expect(result[1]!.role).toBe("assistant");
    expect(result[2]!.role).toBe("user");
  });

  it("returns empty array for empty messages", () => {
    const result = buildContext([], operatorId);
    expect(result).toEqual([]);
  });
});

describe("buildSystemPrompt", () => {
  it("includes the tenant name", () => {
    const result = buildSystemPrompt("Acme Corp");
    expect(result).toContain("Acme Corp");
  });

  it("includes language-matching instruction", () => {
    const result = buildSystemPrompt("Acme Corp");
    expect(result).toMatch(/language/i);
  });

  it("instructs to reply as a support agent", () => {
    const result = buildSystemPrompt("Acme Corp");
    expect(result).toMatch(/support|customer|agent/i);
  });
});
