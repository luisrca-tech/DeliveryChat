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

export interface AIProviderPort {
  generateText(request: AIProviderRequest): Promise<AIProviderResponse>;
  generateObject<TSchema extends z.ZodTypeAny>(
    request: AIProviderObjectRequest<TSchema>,
  ): Promise<AIProviderObjectResponse<TSchema>>;
}
