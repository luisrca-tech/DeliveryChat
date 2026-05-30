import type { z } from "zod";
import {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
} from "./ai.errors.js";
import type {
  AIProviderObjectRequest,
  AIProviderObjectResponse,
  AIProviderPort,
  AIProviderRequest,
  AIProviderResponse,
} from "./ai.providerPort.js";

export class MockProvider implements AIProviderPort {
  private readonly objectQueue: unknown[] = [];

  queueObject(object: unknown): void {
    this.objectQueue.push(object);
  }

  async generateText(request: AIProviderRequest): Promise<AIProviderResponse> {
    const prompt = request.systemPrompt;

    if (prompt.includes("__TIMEOUT__")) {
      throw new AITimeoutError("AI provider timed out: mock timeout");
    }

    if (prompt.includes("__RATE_LIMIT__")) {
      throw new AIProviderRateLimitError(
        "AI provider rate limit exceeded: mock rate limit",
      );
    }

    if (prompt.includes("__PROVIDER_ERROR__")) {
      throw new AIProviderError(
        "AI provider request failed: mock provider error",
      );
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

  async generateObject<TSchema extends z.ZodTypeAny>(
    request: AIProviderObjectRequest<TSchema>,
  ): Promise<AIProviderObjectResponse<TSchema>> {
    const prompt = request.systemPrompt;

    if (prompt.includes("__TIMEOUT__")) {
      throw new AITimeoutError("AI provider timed out: mock timeout");
    }
    if (prompt.includes("__RATE_LIMIT__")) {
      throw new AIProviderRateLimitError(
        "AI provider rate limit exceeded: mock rate limit",
      );
    }
    if (prompt.includes("__PROVIDER_ERROR__")) {
      throw new AIProviderError(
        "AI provider request failed: mock provider error",
      );
    }

    if (this.objectQueue.length === 0) {
      throw new Error(
        "MockProvider: no mock object queued. Call queueObject(...) before generateObject.",
      );
    }
    const next = this.objectQueue.shift();
    const parsed = request.schema.parse(next);

    return {
      object: parsed as z.infer<TSchema>,
      usage: { promptTokens: 50, completionTokens: 20 },
      finishReason: "stop",
    };
  }
}
