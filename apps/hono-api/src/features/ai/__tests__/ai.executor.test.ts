import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AIProvider } from "../ai.provider.js";

vi.mock("../../../db/index.js", () => ({
  db: {
    insert: vi.fn(),
  },
}));

const { db } = await import("../../../db/index.js");
const mockInsert = db.insert as ReturnType<typeof vi.fn>;

function mockInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(undefined).then(resolve);
  return chain;
}

const { executeAI } = await import("../ai.executor.js");
const {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
} = await import("../ai.errors.js");

function makeParams(
  providerOverride?: {
    generateText: ReturnType<typeof vi.fn>;
  },
) {
  const generateText =
    providerOverride?.generateText ??
    vi.fn().mockResolvedValue({
      text: "AI response",
      usage: { promptTokens: 50, completionTokens: 20 },
      finishReason: "stop",
    });

  const provider = { generateText } as unknown as AIProvider;

  return {
    provider,
    params: {
      provider,
      systemPrompt: "You are helpful.",
      messages: [{ role: "user" as const, content: "Hello" }],
      action: "generate" as const,
      tenantId: "tenant-1",
      userId: "op-1",
      conversationId: "conv-1",
      model: "mock://test",
    },
  };
}

describe("executeAI", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockInsert.mockReturnValue(mockInsertChain());
  });

  it("returns sanitized text on successful provider call", async () => {
    const { provider, params } = makeParams({
      generateText: vi.fn().mockResolvedValue({
        text: "Try this:\n```js\nconsole.log('hi')\n```",
        usage: { promptTokens: 50, completionTokens: 20 },
        finishReason: "stop",
      }),
    });

    const result = await executeAI(params);

    expect(result.text).not.toContain("```");
    expect(provider.generateText).toHaveBeenCalledOnce();
  });

  it("logs usage with status 'success' after successful call", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const { params } = makeParams();
    await executeAI(params);

    expect(mockInsert).toHaveBeenCalled();
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("success");
    expect(valuesCall.action).toBe("generate");
  });

  it("retries once on transient AIProviderError", async () => {
    const { provider, params } = makeParams({
      generateText: vi
        .fn()
        .mockRejectedValueOnce(new AIProviderError("transient"))
        .mockResolvedValueOnce({
          text: "Recovered",
          usage: { promptTokens: 30, completionTokens: 10 },
          finishReason: "stop",
        }),
    });

    const result = await executeAI(params);

    expect(result.text).toBe("Recovered");
    expect(provider.generateText).toHaveBeenCalledTimes(2);
  });

  it("does not retry on AIProviderRateLimitError", async () => {
    const { provider, params } = makeParams({
      generateText: vi
        .fn()
        .mockRejectedValue(new AIProviderRateLimitError("rate limited")),
    });

    await expect(executeAI(params)).rejects.toThrow("rate limited");
    expect(provider.generateText).toHaveBeenCalledTimes(1);
  });

  it("retries on AITimeoutError then throws with status 'timeout'", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const { provider, params } = makeParams({
      generateText: vi
        .fn()
        .mockRejectedValue(new AITimeoutError("timed out")),
    });

    await expect(executeAI(params)).rejects.toThrow("timed out");
    expect(provider.generateText).toHaveBeenCalledTimes(2);

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("timeout");
  });

  it("throws AIEmptyResponseError and logs status 'empty'", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const { params } = makeParams({
      generateText: vi.fn().mockResolvedValue({
        text: "",
        usage: { promptTokens: 30, completionTokens: 0 },
        finishReason: "stop",
      }),
    });

    await expect(executeAI(params)).rejects.toThrow(AIEmptyResponseError);

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("empty");
  });

  it("throws AIContentFilteredError and logs status 'content_filtered'", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const { params } = makeParams({
      generateText: vi.fn().mockResolvedValue({
        text: "",
        usage: { promptTokens: 30, completionTokens: 0 },
        finishReason: "content-filter",
      }),
    });

    await expect(executeAI(params)).rejects.toThrow(AIContentFilteredError);

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("content_filtered");
  });

  it("logs status 'aborted' on AbortError", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    const { params } = makeParams({
      generateText: vi.fn().mockRejectedValue(abortError),
    });

    await expect(
      executeAI({ ...params, abortSignal: new AbortController().signal }),
    ).rejects.toThrow("aborted");

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("aborted");
  });

  it("passes action field through to usage log", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const { params } = makeParams();
    await executeAI({ ...params, action: "improve" });

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.action).toBe("improve");
  });

  it("usage logging failure does not break the main flow", async () => {
    mockInsert.mockImplementation(() => {
      throw new Error("DB down");
    });

    const { params } = makeParams();
    const result = await executeAI(params);

    expect(result.text).toBe("AI response");
  });
});
