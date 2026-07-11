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
  AIProviderToolCall,
  AIProviderToolsRequest,
  AIProviderToolsResponse,
} from "./ai.providerPort.js";

/**
 * Scripted outcome for a single `generateWithTools` call. The mock replays the
 * script deterministically: it invokes the real `execute` of each listed tool
 * (so escalation/data-tool side effects fire exactly as in production), then
 * returns `text` as the model's final answer. `throwError` simulates a provider
 * failure (timeout / rate limit / 500).
 */
export type MockToolLoopScript = {
  toolCalls?: AIProviderToolCall[];
  text?: string;
  throwError?: Error;
};

export class MockProvider implements AIProviderPort {
  private readonly objectQueue: unknown[] = [];
  private readonly toolLoopQueue: MockToolLoopScript[] = [];

  queueObject(object: unknown): void {
    this.objectQueue.push(object);
  }

  queueToolLoop(script: MockToolLoopScript): void {
    this.toolLoopQueue.push(script);
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

  async generateWithTools(
    request: AIProviderToolsRequest,
  ): Promise<AIProviderToolsResponse> {
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

    if (this.toolLoopQueue.length === 0) {
      throw new Error(
        "MockProvider: no tool-loop script queued. Call queueToolLoop(...) before generateWithTools.",
      );
    }

    const script = this.toolLoopQueue.shift()!;
    if (script.throwError) {
      throw script.throwError;
    }

    const toolCalls = script.toolCalls ?? [];
    for (const call of toolCalls) {
      const t = request.tools[call.toolName];
      if (!t) {
        throw new Error(
          `MockProvider: scripted tool "${call.toolName}" is not registered for this call.`,
        );
      }
      // Mirror the SDK: run the tool's execute so its side effects fire.
      await t.execute(call.input ?? {});
    }

    return {
      text: script.text ?? "",
      toolCalls,
      usage: { promptTokens: 50, completionTokens: 20 },
      finishReason: "stop",
    };
  }
}
