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

const { generateReply } = await import("../ai.service.js");

describe("generateReply", () => {
  const baseInput = {
    conversationId: "conv-1",
    operatorId: "op-1",
    tenantId: "tenant-1",
    tenantName: "Acme Corp",
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("does not retry on non-transient errors (timeout)", async () => {
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
        .mockRejectedValue(new AITimeoutError("timed out")),
    };
    mockCreateAIProvider.mockReturnValue(mockProvider);

    await expect(generateReply(baseInput)).rejects.toThrow("timed out");
    expect(mockProvider.generateText).toHaveBeenCalledTimes(1);
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
});
