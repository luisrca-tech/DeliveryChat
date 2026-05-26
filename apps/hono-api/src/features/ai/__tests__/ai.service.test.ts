import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

vi.mock("../ai.provider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai.provider.js")>();
  return {
    ...actual,
    createAIProvider: vi.fn(),
  };
});

const { db } = await import("../../../db/index.js");
const { createAIProvider } = await import("../ai.provider.js");

const mockSelect = db.select as ReturnType<typeof vi.fn>;
const mockInsert = db.insert as ReturnType<typeof vi.fn>;
const mockCreateAIProvider = createAIProvider as ReturnType<typeof vi.fn>;

function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "innerJoin",
    "leftJoin",
    "orderBy",
    "limit",
    "offset",
    "values",
    "set",
  ];

  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }

  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);

  return chain;
}

function mockInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(undefined).then(resolve);
  return chain;
}

const { generateReply, improveMessage } = await import("../ai.service.js");

const OWNERSHIP_OK = [{ id: "conv-1" }];

describe("generateReply", () => {
  const baseInput = {
    conversationId: "conv-1",
    operatorId: "op-1",
    tenantId: "tenant-1",
    tenantName: "Acme Corp",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns generated text on success", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "I need help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "I can help you with that!",
        usage: { promptTokens: 50, completionTokens: 20 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const result = await generateReply(baseInput);

    expect(result.text).toBe("I can help you with that!");
    expect(mockProvider.generateText).toHaveBeenCalledOnce();
  });

  it("logs usage after successful generation", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Hello",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "Hi there!",
        usage: { promptTokens: 30, completionTokens: 10 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await generateReply(baseInput);

    expect(mockInsert).toHaveBeenCalled();
  });

  it("retries once on transient provider error", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );
    mockInsert.mockReturnValue(mockInsertChain());

    const { AIProviderError } = await import("../ai.errors.js");
    const mockProvider = {
      generateText: vi
        .fn()
        .mockRejectedValueOnce(new AIProviderError("transient failure"))
        .mockResolvedValueOnce({
          text: "Recovered response",
          usage: { promptTokens: 30, completionTokens: 10 },
          finishReason: "stop",
        }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const result = await generateReply(baseInput);

    expect(result.text).toBe("Recovered response");
    expect(mockProvider.generateText).toHaveBeenCalledTimes(2);
  });

  it("does not retry on AIProviderRateLimitError", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );
    mockInsert.mockReturnValue(mockInsertChain());

    const { AIProviderRateLimitError } = await import("../ai.errors.js");
    const mockProvider = {
      generateText: vi
        .fn()
        .mockRejectedValue(new AIProviderRateLimitError("rate limited by provider")),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await expect(generateReply(baseInput)).rejects.toThrow("rate limited by provider");
    expect(mockProvider.generateText).toHaveBeenCalledTimes(1);
  });

  it("retries once on timeout then throws with status 'timeout'", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );

    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const { AITimeoutError } = await import("../ai.errors.js");
    const mockProvider = {
      generateText: vi
        .fn()
        .mockRejectedValue(new AITimeoutError("timed out")),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await expect(generateReply(baseInput)).rejects.toThrow("timed out");
    expect(mockProvider.generateText).toHaveBeenCalledTimes(2);

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("timeout");
  });

  it("recovers on second attempt after timeout", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );
    mockInsert.mockReturnValue(mockInsertChain());

    const { AITimeoutError } = await import("../ai.errors.js");
    const mockProvider = {
      generateText: vi
        .fn()
        .mockRejectedValueOnce(new AITimeoutError("timed out"))
        .mockResolvedValueOnce({
          text: "Recovered after timeout",
          usage: { promptTokens: 30, completionTokens: 10 },
          finishReason: "stop",
        }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const result = await generateReply(baseInput);

    expect(result.text).toBe("Recovered after timeout");
    expect(mockProvider.generateText).toHaveBeenCalledTimes(2);
  });

  it("throws AIEmptyResponseError for empty text with stop finish reason", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "",
        usage: { promptTokens: 30, completionTokens: 0 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const { AIEmptyResponseError } = await import("../ai.errors.js");
    await expect(generateReply(baseInput)).rejects.toThrow(AIEmptyResponseError);
  });

  it("throws AIContentFilteredError when finish reason is content-filter", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "",
        usage: { promptTokens: 30, completionTokens: 0 },
        finishReason: "content-filter",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const { AIContentFilteredError } = await import("../ai.errors.js");
    await expect(generateReply(baseInput)).rejects.toThrow(
      AIContentFilteredError,
    );
  });

  it("logs status 'empty' for empty response", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );

    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "",
        usage: { promptTokens: 30, completionTokens: 0 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    try {
      await generateReply(baseInput);
    } catch {
      // expected
    }

    expect(mockInsert).toHaveBeenCalled();
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("empty");
  });

  it("throws AIConversationNotFoundError when conversation belongs to another tenant", async () => {
    // First call (ownership check) returns empty = not found
    // Second call (messages) should never be reached
    mockSelect
      .mockReturnValueOnce(chainMock([]))
      .mockReturnValueOnce(chainMock([]));
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "Should not reach this",
        usage: { promptTokens: 30, completionTokens: 10 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const { AIConversationNotFoundError } = await import("../ai.errors.js");
    await expect(generateReply(baseInput)).rejects.toThrow(
      AIConversationNotFoundError,
    );
    expect(mockProvider.generateText).not.toHaveBeenCalled();
  });

  it("throws AbortError and logs status 'aborted' when signal is aborted", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );

    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    const mockProvider = {
      generateText: vi.fn().mockRejectedValue(abortError),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const controller = new AbortController();
    await expect(
      generateReply({ ...baseInput, abortSignal: controller.signal }),
    ).rejects.toThrow("aborted");

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("aborted");
  });

  it("does not count aborted request against monthly cap (no 'success' status logged)", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        {
          senderId: "visitor-1",
          content: "Help",
          createdAt: "2026-05-25T11:55:00Z",
        },
      ]),
    );

    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    const mockProvider = {
      generateText: vi.fn().mockRejectedValue(abortError),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const controller = new AbortController();
    try {
      await generateReply({ ...baseInput, abortSignal: controller.signal });
    } catch {
      // expected
    }

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).not.toBe("success");
    expect(valuesCall.status).toBe("aborted");
  });
});

describe("improveMessage", () => {
  const baseImproveInput = {
    conversationId: "conv-1",
    draft: "i think we can fix that for you maybe",
    operatorId: "op-1",
    tenantId: "tenant-1",
    tenantName: "Acme Corp",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns improved text on success", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock(OWNERSHIP_OK))
      .mockReturnValue(
        chainMock([
          {
            senderId: "visitor-1",
            content: "My order is broken",
            createdAt: "2026-05-25T11:55:00Z",
          },
        ]),
      );
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "We can certainly fix that for you!",
        usage: { promptTokens: 60, completionTokens: 15 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const result = await improveMessage(baseImproveInput);

    expect(result.text).toBe("We can certainly fix that for you!");
    expect(mockProvider.generateText).toHaveBeenCalledOnce();
  });

  it("includes operator draft in the context messages", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock(OWNERSHIP_OK))
      .mockReturnValue(chainMock([]));
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "Improved draft",
        usage: { promptTokens: 40, completionTokens: 10 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await improveMessage(baseImproveInput);

    const callArgs = mockProvider.generateText.mock.calls[0]![0];
    const lastMessage = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMessage.content).toContain("[Operator draft to improve]");
    expect(lastMessage.content).toContain(baseImproveInput.draft);
  });

  it("uses the improve system prompt (rewrite, not reply)", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock(OWNERSHIP_OK))
      .mockReturnValue(chainMock([]));
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "Improved draft",
        usage: { promptTokens: 40, completionTokens: 10 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await improveMessage(baseImproveInput);

    const callArgs = mockProvider.generateText.mock.calls[0]![0];
    expect(callArgs.systemPrompt).toMatch(/rewrite/i);
    expect(callArgs.systemPrompt).not.toMatch(
      /draft a helpful.*reply to the customer/i,
    );
  });

  it("logs usage with action 'improve'", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock(OWNERSHIP_OK))
      .mockReturnValue(chainMock([]));
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "Improved text",
        usage: { promptTokens: 40, completionTokens: 10 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await improveMessage(baseImproveInput);

    expect(mockInsert).toHaveBeenCalled();
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.action).toBe("improve");
    expect(valuesCall.status).toBe("success");
  });

  it("fetches only 3 messages for context (not the full limit)", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock(OWNERSHIP_OK))
      .mockReturnValue(chainMock([]));
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "Improved",
        usage: { promptTokens: 40, completionTokens: 10 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await improveMessage(baseImproveInput);

    const selectChain = mockSelect.mock.results[1]!.value;
    const limitCall = selectChain.limit as ReturnType<typeof vi.fn>;
    expect(limitCall).toHaveBeenCalledWith(3);
  });

  it("retries once on transient provider error", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock(OWNERSHIP_OK))
      .mockReturnValue(chainMock([]));
    mockInsert.mockReturnValue(mockInsertChain());

    const { AIProviderError } = await import("../ai.errors.js");
    const mockProvider = {
      generateText: vi
        .fn()
        .mockRejectedValueOnce(new AIProviderError("transient failure"))
        .mockResolvedValueOnce({
          text: "Recovered improvement",
          usage: { promptTokens: 40, completionTokens: 10 },
          finishReason: "stop",
        }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const result = await improveMessage(baseImproveInput);

    expect(result.text).toBe("Recovered improvement");
    expect(mockProvider.generateText).toHaveBeenCalledTimes(2);
  });

  it("throws AIConversationNotFoundError when conversation belongs to another tenant", async () => {
    mockSelect.mockReturnValue(chainMock([]));
    mockInsert.mockReturnValue(mockInsertChain());

    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        text: "Should not reach this",
        usage: { promptTokens: 30, completionTokens: 10 },
        finishReason: "stop",
      }),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    const { AIConversationNotFoundError } = await import("../ai.errors.js");
    await expect(improveMessage(baseImproveInput)).rejects.toThrow(
      AIConversationNotFoundError,
    );
    expect(mockProvider.generateText).not.toHaveBeenCalled();
  });
});
