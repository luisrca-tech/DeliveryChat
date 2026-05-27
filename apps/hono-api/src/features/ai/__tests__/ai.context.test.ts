import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildContext,
  buildSystemPrompt,
  buildImprovePrompt,
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
        contentFormat: "plain",
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
        contentFormat: "plain",
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
        contentFormat: "plain",
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
        contentFormat: "plain",
        createdAt: "2026-05-25T11:50:00Z",
      },
      {
        senderId: "operator-1",
        content: "Sure",
        contentFormat: "plain",
        createdAt: "2026-05-25T11:51:00Z",
      },
      {
        senderId: "visitor-1",
        content: "Thanks",
        contentFormat: "plain",
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

  it("serializes lexical messages to plain text in context", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Hello " },
              { type: "text", text: "world", format: 1 },
            ],
          },
        ],
        type: "root",
      },
    });

    const messages: ConversationMessage[] = [
      {
        senderId: "operator-1",
        content: lexicalJson,
        contentFormat: "lexical",
        createdAt: "2026-05-25T11:58:00Z",
      },
    ];

    const result = buildContext(messages, operatorId);
    expect(result[0]!.content).toBe("[Operator, 2min ago] Hello world");
    expect(result[0]!.content).not.toContain("{");
  });

  it("never includes raw Lexical JSON in context", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Customer question" }],
          },
        ],
        type: "root",
      },
    });

    const messages: ConversationMessage[] = [
      {
        senderId: "visitor-1",
        content: lexicalJson,
        contentFormat: "lexical",
        createdAt: "2026-05-25T11:55:00Z",
      },
      {
        senderId: "operator-1",
        content: "Plain reply",
        contentFormat: "plain",
        createdAt: "2026-05-25T11:56:00Z",
      },
    ];

    const result = buildContext(messages, operatorId);
    for (const msg of result) {
      expect(msg.content).not.toContain('"type":"root"');
      expect(msg.content).not.toContain('"type":"paragraph"');
    }
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

  it("includes constrained Markdown format instructions", () => {
    const result = buildSystemPrompt("Acme Corp");
    expect(result).toContain("**bold**");
    expect(result).toContain("# (H1)");
    expect(result).toMatch(/Do NOT use.*links/i);
    expect(result).toMatch(/Do NOT use.*code blocks/i);
  });
});

describe("buildImprovePrompt", () => {
  it("includes the tenant name", () => {
    const result = buildImprovePrompt("Acme Corp");
    expect(result).toContain("Acme Corp");
  });

  it("instructs to rewrite not reply", () => {
    const result = buildImprovePrompt("Acme Corp");
    expect(result).toMatch(/rewrite/i);
    expect(result).toMatch(/do not.*(write a new reply|reply)/i);
  });

  it("instructs to preserve intent and language", () => {
    const result = buildImprovePrompt("Acme Corp");
    expect(result).toMatch(/preserve/i);
    expect(result).toMatch(/language/i);
  });

  it("includes constrained Markdown format instructions", () => {
    const result = buildImprovePrompt("Acme Corp");
    expect(result).toContain("**bold**");
    expect(result).toMatch(/Do NOT use.*links/i);
    expect(result).toMatch(/preserve.*structure/i);
  });
});
