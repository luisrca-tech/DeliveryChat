import { generateText, generateObject, tool, stepCountIs } from "ai";
import { createGroq } from "@ai-sdk/groq";
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
      throw classifyProviderException(error);
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
        model: this.client(request.model),
        system: request.systemPrompt,
        messages: request.messages,
        tools,
        stopWhen: stepCountIs(request.maxSteps),
        abortSignal: request.abortSignal,
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
      "GROQ_API_KEY is not configured. Set it in your environment to use AI features.",
    );
  }
  return new GroqProvider(apiKey);
}
