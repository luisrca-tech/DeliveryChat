import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  MockProvider,
  type AIProviderRequest,
  type AIProviderObjectRequest,
} from "../ai.provider.js";
import {
  AIProviderRateLimitError,
  AIProviderError,
  AITimeoutError,
} from "../ai.errors.js";

describe("MockProvider", () => {
  const defaultRequest: AIProviderRequest = {
    systemPrompt: "You are a helpful support agent.",
    messages: [{ role: "user", content: "Hello, I need help." }],
    model: "mock://test",
  };

  it("returns a generated text response", async () => {
    const provider = new MockProvider();
    const result = await provider.generateText(defaultRequest);

    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("returns usage metadata", async () => {
    const provider = new MockProvider();
    const result = await provider.generateText(defaultRequest);

    expect(result.usage).toBeDefined();
    expect(typeof result.usage.promptTokens).toBe("number");
    expect(typeof result.usage.completionTokens).toBe("number");
  });

  it("returns a finish reason", async () => {
    const provider = new MockProvider();
    const result = await provider.generateText(defaultRequest);

    expect(result.finishReason).toBe("stop");
  });

  it("simulates timeout when system prompt contains __TIMEOUT__", async () => {
    const provider = new MockProvider();
    const request: AIProviderRequest = {
      ...defaultRequest,
      systemPrompt: "__TIMEOUT__",
    };

    await expect(provider.generateText(request)).rejects.toThrow("timeout");
  });

  it("simulates empty response when system prompt contains __EMPTY__", async () => {
    const provider = new MockProvider();
    const request: AIProviderRequest = {
      ...defaultRequest,
      systemPrompt: "__EMPTY__",
    };

    const result = await provider.generateText(request);
    expect(result.text).toBe("");
  });

  it("simulates content filter when system prompt contains __CONTENT_FILTER__", async () => {
    const provider = new MockProvider();
    const request: AIProviderRequest = {
      ...defaultRequest,
      systemPrompt: "__CONTENT_FILTER__",
    };

    const result = await provider.generateText(request);
    expect(result.finishReason).toBe("content-filter");
    expect(result.text).toBe("");
  });

  it("simulates provider error when system prompt contains __PROVIDER_ERROR__", async () => {
    const provider = new MockProvider();
    const request: AIProviderRequest = {
      ...defaultRequest,
      systemPrompt: "__PROVIDER_ERROR__",
    };

    await expect(provider.generateText(request)).rejects.toThrow(
      "provider error",
    );
  });

  it("simulates rate limit when system prompt contains __RATE_LIMIT__", async () => {
    const provider = new MockProvider();
    const request: AIProviderRequest = {
      ...defaultRequest,
      systemPrompt: "__RATE_LIMIT__",
    };

    await expect(provider.generateText(request)).rejects.toThrow(
      AIProviderRateLimitError,
    );
  });
});

describe("MockProvider.generateObject + queueObject", () => {
  const interviewSchema = z.object({
    assistantMessage: z.string(),
    intent: z.enum(["ask", "suggest_finish", "final_question"]),
  });

  const baseRequest = (): AIProviderObjectRequest<typeof interviewSchema> => ({
    systemPrompt: "interviewer system prompt",
    messages: [{ role: "user", content: "hi" }],
    model: "mock://interview",
    schema: interviewSchema,
  });

  it("returns the next queued object verbatim", async () => {
    const provider = new MockProvider();
    provider.queueObject({ assistantMessage: "Tell me about your business.", intent: "ask" });

    const result = await provider.generateObject(baseRequest());

    expect(result.object).toEqual({
      assistantMessage: "Tell me about your business.",
      intent: "ask",
    });
    expect(result.usage.promptTokens).toBeGreaterThanOrEqual(0);
    expect(result.usage.completionTokens).toBeGreaterThanOrEqual(0);
    expect(result.finishReason).toBe("stop");
  });

  it("queues are FIFO", async () => {
    const provider = new MockProvider();
    provider.queueObject({ assistantMessage: "first", intent: "ask" });
    provider.queueObject({ assistantMessage: "second", intent: "suggest_finish" });

    const a = await provider.generateObject(baseRequest());
    const b = await provider.generateObject(baseRequest());

    expect(a.object.assistantMessage).toBe("first");
    expect(b.object.assistantMessage).toBe("second");
  });

  it("throws when no object is queued", async () => {
    const provider = new MockProvider();
    await expect(provider.generateObject(baseRequest())).rejects.toThrow(
      /no mock object queued/i,
    );
  });

  it("simulates provider errors via system prompt sentinels", async () => {
    const provider = new MockProvider();
    const req = { ...baseRequest(), systemPrompt: "__PROVIDER_ERROR__" };
    provider.queueObject({ assistantMessage: "unused", intent: "ask" });

    await expect(provider.generateObject(req)).rejects.toBeInstanceOf(
      AIProviderError,
    );
  });

  it("simulates rate limit via system prompt sentinel", async () => {
    const provider = new MockProvider();
    const req = { ...baseRequest(), systemPrompt: "__RATE_LIMIT__" };

    await expect(provider.generateObject(req)).rejects.toBeInstanceOf(
      AIProviderRateLimitError,
    );
  });

  it("simulates timeout via system prompt sentinel", async () => {
    const provider = new MockProvider();
    const req = { ...baseRequest(), systemPrompt: "__TIMEOUT__" };

    await expect(provider.generateObject(req)).rejects.toBeInstanceOf(
      AITimeoutError,
    );
  });
});

describe("isRetryable (via AIProviderRateLimitError)", () => {
  it("AIProviderRateLimitError is not an instance of AIProviderError", () => {
    const error = new AIProviderRateLimitError("rate limited");
    expect(error).not.toBeInstanceOf(AIProviderError);
  });

  it("AITimeoutError is an instance of AIProviderError (retryable)", () => {
    const error = new AITimeoutError("timed out");
    expect(error).toBeInstanceOf(AIProviderError);
  });
});
