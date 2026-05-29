import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { runAiCall } = await import("../ai.callRunner.js");
const {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
} = await import("../ai.errors.js");

const BASE = {
  action: "generate" as const,
  tenantId: "tenant-1",
  userId: "user-1",
  conversationId: "conv-1",
  model: "mock://m",
};

function okProviderCall(overrides?: Partial<{ result: unknown; finishReason: string }>) {
  return vi.fn().mockResolvedValue({
    result: "hello world",
    inputTokens: 10,
    outputTokens: 5,
    finishReason: "stop",
    ...overrides,
  });
}

describe("runAiCall", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockInsert.mockReturnValue(mockInsertChain());
  });

  it("returns parse(result) on success and writes a usage-log row with the right action", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const providerCall = okProviderCall();

    const result = await runAiCall({
      ...BASE,
      providerCall,
      parse: (raw: string) => ({ text: raw.toUpperCase() }),
    });

    expect(result).toEqual({ text: "HELLO WORLD" });
    expect(providerCall).toHaveBeenCalledOnce();
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(valuesCall.action).toBe("generate");
    expect(valuesCall.status).toBe("success");
    expect(valuesCall.inputTokens).toBe(10);
    expect(valuesCall.outputTokens).toBe(5);
  });

  it("retries once on retryable provider error then succeeds", async () => {
    const providerCall = vi
      .fn()
      .mockRejectedValueOnce(new AIProviderError("transient"))
      .mockResolvedValueOnce({
        result: "ok",
        inputTokens: 1,
        outputTokens: 1,
        finishReason: "stop",
      });

    const result = await runAiCall({
      ...BASE,
      providerCall,
      parse: (r: string) => ({ text: r }),
    });

    expect(result).toEqual({ text: "ok" });
    expect(providerCall).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on AIProviderRateLimitError and logs provider_error", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const providerCall = vi.fn().mockRejectedValue(new AIProviderRateLimitError("rl"));

    await expect(
      runAiCall({ ...BASE, providerCall, parse: (r: string) => r }),
    ).rejects.toThrow(AIProviderRateLimitError);

    expect(providerCall).toHaveBeenCalledTimes(1);
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(valuesCall.status).toBe("provider_error");
  });

  it("logs status=timeout for AITimeoutError after retries", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const providerCall = vi.fn().mockRejectedValue(new AITimeoutError("t"));

    await expect(
      runAiCall({ ...BASE, providerCall, parse: (r: string) => r }),
    ).rejects.toThrow(AITimeoutError);

    expect(providerCall).toHaveBeenCalledTimes(2);
    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(valuesCall.status).toBe("timeout");
  });

  it("logs status=content_filtered and throws AIContentFilteredError when finishReason is content-filter", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const providerCall = okProviderCall({ result: "", finishReason: "content-filter" });

    await expect(
      runAiCall({ ...BASE, providerCall, parse: (r: string) => r }),
    ).rejects.toThrow(AIContentFilteredError);

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(valuesCall.status).toBe("content_filtered");
  });

  it("logs status=empty when parse throws AIEmptyResponseError", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const providerCall = okProviderCall({ result: "" });

    await expect(
      runAiCall({
        ...BASE,
        providerCall,
        parse: (r: string) => {
          if (!r || !r.trim()) throw new AIEmptyResponseError("empty");
          return r;
        },
      }),
    ).rejects.toThrow(AIEmptyResponseError);

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(valuesCall.status).toBe("empty");
  });

  it("does NOT swallow non-provider errors raised by providerCall", async () => {
    const providerCall = vi.fn().mockRejectedValue(new TypeError("bug"));

    await expect(
      runAiCall({ ...BASE, providerCall, parse: (r: string) => r }),
    ).rejects.toThrow(TypeError);
    expect(providerCall).toHaveBeenCalledTimes(1);
  });

  it("logs status=aborted on AbortError", async () => {
    const insertChain = mockInsertChain();
    mockInsert.mockReturnValue(insertChain);
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const providerCall = vi.fn().mockRejectedValue(abortErr);

    await expect(
      runAiCall({
        ...BASE,
        providerCall,
        parse: (r: string) => r,
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("aborted");

    const valuesCall = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(valuesCall.status).toBe("aborted");
  });

  it("joins caller's tx instead of opening its own", async () => {
    const txInsertChain = mockInsertChain();
    const tx = { insert: vi.fn().mockReturnValue(txInsertChain) };
    const providerCall = okProviderCall();

    await runAiCall({
      ...BASE,
      providerCall,
      parse: (r: string) => r,
      tx: tx as unknown as typeof db,
    });

    expect(tx.insert).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("usage-log insert failure does not break the main flow", async () => {
    mockInsert.mockImplementation(() => {
      throw new Error("DB down");
    });
    const providerCall = okProviderCall();

    const result = await runAiCall({
      ...BASE,
      providerCall,
      parse: (r: string) => ({ text: r }),
    });
    expect(result).toEqual({ text: "hello world" });
  });
});
