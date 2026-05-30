import { generateText, generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import type { z } from "zod";
import {
  AITimeoutError,
  AIProviderError,
  AIProviderRateLimitError,
} from "./ai.errors.js";
import type {
  AIProviderObjectRequest,
  AIProviderObjectResponse,
  AIProviderPort,
  AIProviderRequest,
  AIProviderResponse,
} from "./ai.providerPort.js";
import { MockProvider } from "./ai.mockProvider.js";

export class GroqProvider implements AIProviderPort {
  private readonly client: ReturnType<typeof createGroq>;

  constructor(apiKey: string) {
    this.client = createGroq({ apiKey });
  }

  async generateText(request: AIProviderRequest): Promise<AIProviderResponse> {
    try {
      const result = await generateText({
        model: this.client(request.model),
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
      throw mapProviderError(error);
    }
  }

  async generateObject<TSchema extends z.ZodTypeAny>(
    request: AIProviderObjectRequest<TSchema>,
  ): Promise<AIProviderObjectResponse<TSchema>> {
    try {
      const result = await generateObject({
        model: this.client(request.model),
        system: request.systemPrompt,
        messages: request.messages,
        schema: request.schema,
        abortSignal: request.abortSignal,
      });

      return {
        object: result.object as z.infer<TSchema>,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
        },
        finishReason: result.finishReason,
      };
    } catch (error) {
      throw mapProviderError(error);
    }
  }
}

function mapProviderError(error: unknown): unknown {
  if (error instanceof Error && error.name === "AbortError") {
    return error;
  }
  if (
    error instanceof Error &&
    (error.message.includes("timeout") || error.message.includes("ETIMEDOUT"))
  ) {
    return new AITimeoutError("AI provider timed out", { cause: error });
  }
  const statusCode =
    (error as { statusCode?: number }).statusCode ??
    (error as { status?: number }).status;
  if (statusCode === 429) {
    return new AIProviderRateLimitError("AI provider rate limit exceeded", {
      cause: error,
    });
  }
  return new AIProviderError("AI provider request failed", { cause: error });
}

export function createAIProvider(
  model: string,
  apiKey: string | undefined,
): AIProviderPort {
  if (model.startsWith("mock://")) {
    return new MockProvider();
  }
  if (!apiKey) {
    throw new AIProviderError(
      "GROQ_API_KEY is not configured. Set it in your environment to use AI features.",
    );
  }
  return new GroqProvider(apiKey);
}
