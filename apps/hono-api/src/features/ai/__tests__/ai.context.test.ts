import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildContext,
  buildSystemPrompt,
  buildAutonomousSystemPrompt,
  baseGuardRails,
  actionInstructions,
  applicationContext,
  SECURITY_RULES,
  DATA_HONESTY_RULES,
  AUTHORITY_RULES,
  SCOPE_RULES,
  IDENTITY_RULES,
  MARKDOWN_FORMAT_INSTRUCTIONS,
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
        contentPlainText: "I need help with my order",
        createdAt: "2026-05-25T11:55:00Z",
      },
    ];

    const result = buildContext(messages, operatorId);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
    expect(result[0]!.content).toBe(
      "[Customer, 5min ago] I need help with my order",
    );
  });

  it("formats an operator message with role prefix", () => {
    const messages: ConversationMessage[] = [
      {
        senderId: "operator-1",
        content: "Let me check that for you",
        contentPlainText: "Let me check that for you",
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
        contentPlainText: "Hello",
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
        contentPlainText: "Help me",
        createdAt: "2026-05-25T11:50:00Z",
      },
      {
        senderId: "operator-1",
        content: "Sure",
        contentPlainText: "Sure",
        createdAt: "2026-05-25T11:51:00Z",
      },
      {
        senderId: "visitor-1",
        content: "Thanks",
        contentPlainText: "Thanks",
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

  it("uses pre-computed contentPlainText for lexical messages", () => {
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
        contentPlainText: "Hello world",
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
        contentPlainText: "Customer question",
        createdAt: "2026-05-25T11:55:00Z",
      },
      {
        senderId: "operator-1",
        content: "Plain reply",
        contentPlainText: "Plain reply",
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

describe("baseGuardRails", () => {
  it("returns text covering all five safety categories", () => {
    const result = baseGuardRails();
    for (const rule of SECURITY_RULES) {
      expect(result).toContain(rule);
    }
    for (const rule of DATA_HONESTY_RULES) {
      expect(result).toContain(rule);
    }
    for (const rule of AUTHORITY_RULES) {
      expect(result).toContain(rule);
    }
    for (const rule of SCOPE_RULES) {
      expect(result).toContain(rule);
    }
    for (const rule of IDENTITY_RULES) {
      expect(result).toContain(rule);
    }
  });

  it("each safety category is a non-empty array", () => {
    expect(SECURITY_RULES.length).toBeGreaterThan(0);
    expect(DATA_HONESTY_RULES.length).toBeGreaterThan(0);
    expect(AUTHORITY_RULES.length).toBeGreaterThan(0);
    expect(SCOPE_RULES.length).toBeGreaterThan(0);
    expect(IDENTITY_RULES.length).toBeGreaterThan(0);
  });

  it("is deterministic across calls", () => {
    expect(baseGuardRails()).toBe(baseGuardRails());
  });
});

describe("actionInstructions", () => {
  it("returns generate-specific instructions for 'generate'", () => {
    const result = actionInstructions("generate");
    expect(result).toMatch(/support|customer|agent/i);
    expect(result).toMatch(/reply/i);
  });

  it("returns improve-specific instructions for 'improve'", () => {
    const result = actionInstructions("improve");
    expect(result).toMatch(/rewrite/i);
    expect(result).toMatch(/draft/i);
  });

  it("produces distinct output for generate vs improve", () => {
    const generate = actionInstructions("generate");
    const improve = actionInstructions("improve");
    expect(generate).not.toBe(improve);
  });

  it("both include markdown format instructions", () => {
    const generate = actionInstructions("generate");
    const improve = actionInstructions("improve");
    expect(generate).toContain("**bold**");
    expect(improve).toContain("**bold**");
  });

  it("uses the shared MARKDOWN_FORMAT_INSTRUCTIONS constant", () => {
    const generate = actionInstructions("generate");
    const improve = actionInstructions("improve");
    expect(generate).toContain(MARKDOWN_FORMAT_INSTRUCTIONS);
    expect(improve).toContain(MARKDOWN_FORMAT_INSTRUCTIONS);
  });
});

describe("applicationContext", () => {
  it("returns formatted summary when provided", () => {
    const summary = "This is a pizza delivery app.";
    const result = applicationContext(summary);
    expect(result).toContain(summary);
    expect(result.length).toBeGreaterThan(summary.length);
  });

  it("returns empty string when undefined", () => {
    expect(applicationContext(undefined)).toBe("");
  });

  it("returns empty string when empty string", () => {
    expect(applicationContext("")).toBe("");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the tenant name", () => {
    const result = buildSystemPrompt({
      action: "generate",
      tenantName: "Acme Corp",
    });
    expect(result).toContain("Acme Corp");
  });

  it("includes guard rails", () => {
    const result = buildSystemPrompt({
      action: "generate",
      tenantName: "Acme Corp",
    });
    const guardRails = baseGuardRails();
    expect(result).toContain(guardRails);
  });

  it("includes action instructions for generate", () => {
    const result = buildSystemPrompt({
      action: "generate",
      tenantName: "Acme Corp",
    });
    expect(result).toMatch(/support|customer|agent/i);
  });

  it("includes action instructions for improve", () => {
    const result = buildSystemPrompt({
      action: "improve",
      tenantName: "Acme Corp",
    });
    expect(result).toMatch(/rewrite/i);
  });

  it("includes application context when provided", () => {
    const result = buildSystemPrompt({
      action: "generate",
      tenantName: "Acme Corp",
      contextSummary: "We sell widgets online.",
    });
    expect(result).toContain("We sell widgets online.");
  });

  it("omits application context when not provided", () => {
    const withContext = buildSystemPrompt({
      action: "generate",
      tenantName: "Acme Corp",
      contextSummary: "We sell widgets online.",
    });
    const withoutContext = buildSystemPrompt({
      action: "generate",
      tenantName: "Acme Corp",
    });
    expect(withContext.length).toBeGreaterThan(withoutContext.length);
  });

  it("composes all layers: guard rails + action + context", () => {
    const result = buildSystemPrompt({
      action: "generate",
      tenantName: "TestTenant",
      contextSummary: "Pizza delivery service.",
    });

    expect(result).toContain(baseGuardRails());
    expect(result).toContain("**bold**");
    expect(result).toContain("Pizza delivery service.");
    expect(result).toContain("TestTenant");
  });

  it("includes constrained Markdown format instructions", () => {
    const result = buildSystemPrompt({
      action: "generate",
      tenantName: "Acme Corp",
    });
    expect(result).toContain("**bold**");
    expect(result).toContain("# (H1)");
    expect(result).toMatch(/Do NOT use.*links/i);
    expect(result).toMatch(/Do NOT use.*code blocks/i);
  });
});

describe("buildAutonomousSystemPrompt — grounded special-value answers", () => {
  const prompt = () =>
    buildAutonomousSystemPrompt({
      tenantName: "TestTenant",
      toolNames: ["getPlanInfo"],
    });

  it("teaches that null/zero/'custom'/'free' tool values are grounded answers, not gaps", () => {
    const result = prompt();
    expect(result).toMatch(/null.*zero.*"custom".*"free"/i);
    expect(result).toMatch(/no price .*free of charge/i);
    expect(result).toMatch(/"custom".*contact sales/i);
  });

  it("scopes escalation to results with no basis for an answer, not unusual values", () => {
    const result = prompt();
    expect(result).toMatch(/no basis for an answer/i);
    expect(result).not.toMatch(/insufficient data/i);
  });

  it("scopes 'when in doubt' to doubt about facts", () => {
    const result = prompt();
    expect(result).toMatch(/in doubt about a fact/i);
  });

  it("forbids narrating a tool call instead of making one", () => {
    const result = prompt();
    expect(result).toMatch(/NEVER announce/);
    expect(result).toMatch(/call the tool silently/i);
    expect(result).toMatch(/promises information later instead of containing it/i);
  });

  it("forbids echoing raw JSON or tool call input/output in the reply", () => {
    const result = prompt();
    expect(result).toMatch(/NEVER include raw JSON/);
    expect(result).toMatch(/tool call inputs, or tool outputs verbatim/i);
    expect(result).toMatch(/natural sentences or Markdown tables/i);
  });

  it("forbids inferring an answer from a related field that doesn't state the asked fact", () => {
    const result = prompt();
    expect(result).toMatch(/does not explicitly state the specific fact/i);
    expect(result).toMatch(
      /never infer an answer from the presence of a related field/i,
    );
  });
});
