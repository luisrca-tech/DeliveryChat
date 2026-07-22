import { generateText, generateObject, tool, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { z } from "zod";
import { AIProviderError } from "./ai.errors.js";
import { classifyProviderException } from "./ai.errorPolicy.js";
import type {
  AIProviderObjectRequest,
  AIProviderObjectResponse,
  AIProviderPort,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderToolsRequest,
  AIProviderToolsResponse,
} from "./ai.providerPort.js";
import { MockProvider } from "./ai.mockProvider.js";

// Disable the AI SDK's internal retries so there is exactly ONE retry layer —
// the orchestrator's (runAICall). Otherwise a quota-exhausted 429 turns into
// SDK retries × orchestrator retries (6 provider calls for one failed turn).
const NO_SDK_RETRIES = { maxRetries: 0 } as const;

// Only route to upstream providers that support every parameter in the
// request (schema/tools/etc.), so OpenRouter never silently drops one.
const CHAT_SETTINGS = { provider: { require_parameters: true } } as const;

export class OpenRouterProvider implements AIProviderPort {
  private readonly client: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string) {
    this.client = createOpenRouter({ apiKey });
  }

  async generateText(request: AIProviderRequest): Promise<AIProviderResponse> {
    try {
      const result = await generateText({
        model: this.client.chat(request.model, CHAT_SETTINGS),
        system: request.systemPrompt,
        messages: request.messages,
        abortSignal: request.abortSignal,
        ...NO_SDK_RETRIES,
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
      throw classifyProviderException(error);
    }
  }

  async generateObject<TSchema extends z.ZodTypeAny>(
    request: AIProviderObjectRequest<TSchema>,
  ): Promise<AIProviderObjectResponse<TSchema>> {
    try {
      const result = await generateObject({
        model: this.client.chat(request.model, CHAT_SETTINGS),
        system: request.systemPrompt,
        messages: request.messages,
        schema: request.schema,
        abortSignal: request.abortSignal,
        ...NO_SDK_RETRIES,
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
      throw classifyProviderException(error);
    }
  }

  async generateWithTools(
    request: AIProviderToolsRequest,
  ): Promise<AIProviderToolsResponse> {
    try {
      const tools = Object.fromEntries(
        Object.entries(request.tools).map(([name, t]) => [
          name,
          tool({
            description: t.description,
            inputSchema: t.inputSchema,
            execute: async (input: unknown) =>
              t.execute((input ?? {}) as Record<string, unknown>),
          }),
        ]),
      );

      const result = await generateText({
        model: this.client.chat(request.model, CHAT_SETTINGS),
        system: request.systemPrompt,
        messages: request.messages,
        tools,
        stopWhen: stepCountIs(request.maxSteps),
        abortSignal: request.abortSignal,
        ...NO_SDK_RETRIES,
      });

      return {
        text: result.text,
        toolCalls: result.toolCalls.map((tc) => ({
          toolName: tc.toolName,
          input: (tc.input ?? {}) as Record<string, unknown>,
        })),
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
        },
        finishReason: result.finishReason,
      };
    } catch (error) {
      throw classifyProviderException(error);
    }
  }
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
      "OPENROUTER_API_KEY is not configured. Set it in your environment to use AI features.",
    );
  }
  return new OpenRouterProvider(apiKey);
}
