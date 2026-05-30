import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DbExecutor } from "../../../db/index.js";
import type {
  AIProviderObjectRequest,
  AIProviderPort,
  AIProviderResponse,
} from "../ai.providerPort.js";

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

const { runAICall } = await import("../ai.callOrchestrator.js");
const {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
} = await import("../ai.errors.js");
const { sanitizeAiMarkdown } = await import("../ai.sanitize.js");

class FakeProvider implements AIProviderPort {
  constructor(
    public generateText: AIProviderPort["generateText"] = vi.fn(),
    public generateObject: AIProviderPort["generateObject"] = vi.fn(),
  ) {}
}

function textResponse(
  overrides?: Partial<AIProviderResponse>,
): AIProviderResponse {
  return {
    text: "hello world",
    usage: { promptTokens: 10, completionTokens: 5 },
    finishReason: "stop",
    ...overrides,
  };
}

const BASE = {
  action: "generate" as const,
  tenantId: "tenant-1",
  userId: "user-1",
  conversationId: "conv-1",
  model: "mock://m",
};

function callTextRun<TParsed>(
  provider: AIProviderPort,
  parse: (raw: string) => TParsed,
  extras: Partial<{ abortSignal: AbortSignal; tx: DbExecutor }> = {},
) {
  return runAICall<string, TParsed>({
    ...BASE,
    ...extras,
    providerCall: async () => {
      const r = await provider.generateText({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "hi" }],
        model: BASE.model,
      });
      return {
        result: r.text,
        inputTokens: r.usage.promptTokens,
        outputTokens: r.usage.completionTokens,
        finishReason: r.finishReason,
      };
    },
    parse,
  });
}

describe("AICallOrchestrator.runAICall", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockInsert.mockReturnValue(mockInsertChain());
  });

  it("returns parsed value on success and writes a usage-log row", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const provider = new FakeProvider(vi.fn().mockResolvedValue(textResponse()));

    const result = await callTextRun(provider, (raw) => ({
      text: raw.toUpperCase(),
    }));

    expect(result).toEqual({ text: "HELLO WORLD" });
    expect(provider.generateText).toHaveBeenCalledOnce();
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.action).toBe("generate");
    expect(valuesCall.status).toBe("success");
    expect(valuesCall.inputTokens).toBe(10);
    expect(valuesCall.outputTokens).toBe(5);
    expect(valuesCall.finishReason).toBe("stop");
    expect(valuesCall.latencyMs).toBeTypeOf("number");
  });

  it("sanitises markdown via parse (caller-supplied)", async () => {
    const provider = new FakeProvider(
      vi.fn().mockResolvedValue(
        textResponse({ text: "Try this:\n```js\nconsole.log('hi')\n```" }),
      ),
    );

    const result = await callTextRun(provider, (raw) => ({
      text: sanitizeAiMarkdown(raw),
    }));

    expect(result.text).not.toContain("```");
  });

  it("retries once on retryable AIProviderError, then succeeds", async () => {
    const generateText = vi
      .fn()
      .mockRejectedValueOnce(new AIProviderError("transient"))
      .mockResolvedValueOnce(textResponse({ text: "ok" }));
    const provider = new FakeProvider(generateText);

    const result = await callTextRun(provider, (raw) => raw);

    expect(result).toBe("ok");
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on AIProviderRateLimitError, logs provider_error", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const provider = new FakeProvider(
      vi.fn().mockRejectedValue(new AIProviderRateLimitError("rl")),
    );

    await expect(callTextRun(provider, (r) => r)).rejects.toThrow(
      AIProviderRateLimitError,
    );
    expect(provider.generateText).toHaveBeenCalledTimes(1);
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("provider_error");
  });

  it("retries on AITimeoutError, logs status=timeout", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const provider = new FakeProvider(
      vi.fn().mockRejectedValue(new AITimeoutError("t")),
    );

    await expect(callTextRun(provider, (r) => r)).rejects.toThrow(
      AITimeoutError,
    );
    expect(provider.generateText).toHaveBeenCalledTimes(2);
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("timeout");
  });

  it("logs status=content_filtered and throws AIContentFilteredError when finishReason=content-filter", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const provider = new FakeProvider(
      vi.fn().mockResolvedValue(textResponse({ finishReason: "content-filter" })),
    );

    await expect(callTextRun(provider, (r) => r)).rejects.toThrow(
      AIContentFilteredError,
    );
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("content_filtered");
  });

  it("logs status=empty when parse throws AIEmptyResponseError", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const provider = new FakeProvider(
      vi.fn().mockResolvedValue(textResponse({ text: "" })),
    );

    await expect(
      callTextRun(provider, (r) => {
        if (!r || !r.trim()) throw new AIEmptyResponseError("empty");
        return r;
      }),
    ).rejects.toThrow(AIEmptyResponseError);

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("empty");
  });

  it("does not retry on a non-AI error and logs it as provider_error", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const provider = new FakeProvider(
      vi.fn().mockRejectedValue(new TypeError("bug")),
    );

    await expect(callTextRun(provider, (r) => r)).rejects.toThrow(TypeError);
    expect(provider.generateText).toHaveBeenCalledTimes(1);
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("provider_error");
  });

  it("logs status=aborted on AbortError", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const provider = new FakeProvider(vi.fn().mockRejectedValue(abortErr));

    await expect(
      callTextRun(provider, (r) => r, {
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("aborted");

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.status).toBe("aborted");
  });

  it("uses caller's tx instead of opening its own", async () => {
    const txInsertChain = mockInsertChain();
    const tx = { insert: vi.fn().mockReturnValue(txInsertChain) };
    const provider = new FakeProvider(vi.fn().mockResolvedValue(textResponse()));

    await callTextRun(provider, (r) => r, { tx: tx as unknown as DbExecutor });

    expect(tx.insert).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("usage-log insert failure does not break the main flow", async () => {
    mockInsert.mockImplementation(() => {
      throw new Error("DB down");
    });
    const provider = new FakeProvider(vi.fn().mockResolvedValue(textResponse()));

    const result = await callTextRun(provider, (raw) => ({ text: raw }));
    expect(result).toEqual({ text: "hello world" });
  });

  it("threads through generateObject results when providerCall uses generateObject", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const generateObject = vi.fn().mockResolvedValue({
      object: { kind: "ok" },
      usage: { promptTokens: 7, completionTokens: 3 },
      finishReason: "stop",
    }) as unknown as AIProviderPort["generateObject"];
    const provider = new FakeProvider(undefined, generateObject);

    const result = await runAICall<{ kind: string }, { kind: string }>({
      ...BASE,
      action: "interview",
      providerCall: async () => {
        const r = await provider.generateObject({
          systemPrompt: "sys",
          messages: [{ role: "user", content: "hi" }],
          model: BASE.model,
          schema: {} as unknown as Parameters<typeof provider.generateObject>[0]["schema"],
        } as AIProviderObjectRequest<never>);
        return {
          result: r.object,
          inputTokens: r.usage.promptTokens,
          outputTokens: r.usage.completionTokens,
          finishReason: r.finishReason,
        };
      },
      parse: (o) => o,
    });

    expect(result).toEqual({ kind: "ok" });
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.action).toBe("interview");
    expect(valuesCall.inputTokens).toBe(7);
    expect(valuesCall.outputTokens).toBe(3);
  });

  it("writes a synthetic success row when providerCall returns a canned outcome (forced completion)", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);

    const result = await runAICall<null, null>({
      ...BASE,
      action: "interview_forced_completion",
      conversationId: null,
      providerCall: async () => ({
        result: null,
        inputTokens: 0,
        outputTokens: 0,
        finishReason: "forced_completion",
      }),
      parse: (v) => v,
    });

    expect(result).toBeNull();
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(valuesCall.action).toBe("interview_forced_completion");
    expect(valuesCall.status).toBe("success");
    expect(valuesCall.finishReason).toBe("forced_completion");
    expect(valuesCall.inputTokens).toBe(0);
    expect(valuesCall.outputTokens).toBe(0);
  });

  it("uses an injected AIProviderPort without monkey-patching network code", () => {
    const provider: AIProviderPort = new FakeProvider();
    expect(typeof provider.generateText).toBe("function");
    expect(typeof provider.generateObject).toBe("function");
  });
});
