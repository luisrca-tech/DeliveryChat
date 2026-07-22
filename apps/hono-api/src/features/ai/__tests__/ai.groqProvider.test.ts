import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  tool: vi.fn((definition: unknown) => definition),
  stepCountIs: vi.fn(() => "stop-when-step-count"),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: vi.fn(() => vi.fn((model: string) => ({ modelId: model }))),
}));

const { generateText, generateObject } = await import("ai");
const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockGenerateObject = generateObject as ReturnType<typeof vi.fn>;

const { GroqProvider } = await import("../ai.groqProvider.js");

const usage = { inputTokens: 10, outputTokens: 5 };

describe("GroqProvider retry configuration", () => {
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

  const provider = new GroqProvider("gsk_test_key");

  it("passes maxRetries: 0 to generateText", async () => {
    await provider.generateText({
      model: "llama-3.3-70b-versatile",
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it("passes maxRetries: 0 to generateObject", async () => {
    await provider.generateObject({
      model: "llama-3.3-70b-versatile",
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
      model: "llama-3.3-70b-versatile",
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
});
