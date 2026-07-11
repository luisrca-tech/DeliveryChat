import type { z } from "zod";

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

export type AIProviderObjectRequest<TSchema extends z.ZodTypeAny> = {
  systemPrompt: string;
  messages: AIProviderMessage[];
  model: string;
  schema: TSchema;
  abortSignal?: AbortSignal;
};

export type AIProviderObjectResponse<TSchema extends z.ZodTypeAny> = {
  object: z.infer<TSchema>;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
};

/**
 * A single function-calling tool exposed to the model during a tool-loop call.
 * `inputSchema` is a Zod object; `execute` runs our own JS (fetch/SELECT/etc.)
 * and returns a JSON-serializable result that is fed back to the model.
 */
export type AIProviderTool = {
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export type AIProviderToolCall = {
  toolName: string;
  input: Record<string, unknown>;
};

export type AIProviderToolsRequest = {
  systemPrompt: string;
  messages: AIProviderMessage[];
  model: string;
  tools: Record<string, AIProviderTool>;
  maxSteps: number;
  abortSignal?: AbortSignal;
};

export type AIProviderToolsResponse = {
  text: string;
  toolCalls: AIProviderToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
};

export interface AIProviderPort {
  generateText(request: AIProviderRequest): Promise<AIProviderResponse>;
  generateObject<TSchema extends z.ZodTypeAny>(
    request: AIProviderObjectRequest<TSchema>,
  ): Promise<AIProviderObjectResponse<TSchema>>;
  /**
   * Multi-step tool loop: the SDK repeatedly calls the model, executes any
   * requested tools (our `execute`), and feeds results back until the model
   * emits final text or `maxSteps` is reached.
   */
  generateWithTools(
    request: AIProviderToolsRequest,
  ): Promise<AIProviderToolsResponse>;
}
