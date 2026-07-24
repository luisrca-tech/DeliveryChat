import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const chat = vi.fn((model: string) => ({ modelId: model }));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  tool: vi.fn((definition: unknown) => definition),
  stepCountIs: vi.fn(() => "stop-when-step-count"),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => Object.assign(vi.fn(), { chat })),
}));

const { generateText, generateObject } = await import("ai");
const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockGenerateObject = generateObject as ReturnType<typeof vi.fn>;

const { OpenRouterProvider, createAIProvider } = await import(
  "../ai.openRouterProvider.js"
);
const { MockProvider } = await import("../ai.mockProvider.js");
const { AIProviderError } = await import("../ai.errors.js");

const usage = { inputTokens: 10, outputTokens: 5 };

describe("OpenRouterProvider retry configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({
      text: "hello",
      usage,
      finishReason: "stop",
      toolCalls: [],
    });
    mockGenerateObject.mockResolvedValue({
      object: { answer: "hello" },
      usage,
      finishReason: "stop",
    });
  });

  const provider = new OpenRouterProvider("sk-or-test-key");

  it("passes maxRetries: 0 to generateText", async () => {
    await provider.generateText({
      model: "openai/gpt-4o",
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it("passes maxRetries: 0 to generateObject", async () => {
    await provider.generateObject({
      model: "openai/gpt-4o",
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      schema: z.object({ answer: z.string() }),
    });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it("passes maxRetries: 0 to generateText in generateWithTools", async () => {
    await provider.generateWithTools({
      model: "openai/gpt-4o",
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: {
        lookup: {
          description: "Look something up",
          inputSchema: z.object({ id: z.string() }),
          execute: async () => ({ ok: true }),
        },
      },
      maxSteps: 3,
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it("instantiates models via chat() with provider.require_parameters", async () => {
    await provider.generateText({
      model: "openai/gpt-4o",
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(chat).toHaveBeenCalledWith(
      "openai/gpt-4o",
      expect.objectContaining({
        provider: expect.objectContaining({ require_parameters: true }),
      }),
    );
  });
});

describe("createAIProvider", () => {
  it("returns MockProvider for mock:// models", () => {
    const provider = createAIProvider("mock://test", undefined);
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it("throws AIProviderError when apiKey is missing", () => {
    expect(() => createAIProvider("openai/gpt-4o", undefined)).toThrow(
      AIProviderError,
    );
  });

  it("returns OpenRouterProvider when apiKey is present", () => {
    const provider = createAIProvider("openai/gpt-4o", "sk-or-test-key");
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });
});
