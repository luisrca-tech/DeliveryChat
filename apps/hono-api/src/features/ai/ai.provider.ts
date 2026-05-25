import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { AITimeoutError, AIProviderError } from "./ai.errors.js";

export type AIProviderMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AIProviderRequest = {
  systemPrompt: string;
  messages: AIProviderMessage[];
  model: string;
  abortSignal?: AbortSignal;
};

export type AIProviderResponse = {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
};

export interface AIProvider {
  generateText(request: AIProviderRequest): Promise<AIProviderResponse>;
}

export class GroqProvider implements AIProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateText(request: AIProviderRequest): Promise<AIProviderResponse> {
    const groq = createGroq({ apiKey: this.apiKey });

    try {
      const result = await generateText({
        model: groq(request.model),
        system: request.systemPrompt,
        messages: request.messages,
        abortSignal: request.abortSignal,
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
        },
        finishReason: result.finishReason,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.message.includes("timeout") ||
          error.message.includes("ETIMEDOUT"))
      ) {
        throw new AITimeoutError("AI provider timed out", { cause: error });
      }
      throw new AIProviderError("AI provider request failed", {
        cause: error,
      });
    }
  }
}

export class MockProvider implements AIProvider {
  async generateText(request: AIProviderRequest): Promise<AIProviderResponse> {
    const prompt = request.systemPrompt;

    if (prompt.includes("__TIMEOUT__")) {
      throw new AITimeoutError("AI provider timed out: mock timeout");
    }

    if (prompt.includes("__PROVIDER_ERROR__")) {
      throw new AIProviderError("AI provider request failed: mock provider error");
    }

    if (prompt.includes("__CONTENT_FILTER__")) {
      return {
        text: "",
        usage: { promptTokens: 10, completionTokens: 0 },
        finishReason: "content-filter",
      };
    }

    if (prompt.includes("__EMPTY__")) {
      return {
        text: "",
        usage: { promptTokens: 10, completionTokens: 0 },
        finishReason: "stop",
      };
    }

    return {
      text: "I understand your concern. Let me help you with that.",
      usage: { promptTokens: 50, completionTokens: 20 },
      finishReason: "stop",
    };
  }
}

export function createAIProvider(
  model: string,
  apiKey: string,
): AIProvider {
  if (model.startsWith("mock://")) {
    return new MockProvider();
  }
  return new GroqProvider(apiKey);
}
