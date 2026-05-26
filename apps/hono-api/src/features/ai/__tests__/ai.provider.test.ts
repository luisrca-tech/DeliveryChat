import { describe, it, expect, vi } from "vitest";
import {
  MockProvider,
  type AIProviderRequest,
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
