import type { AIProvider, AIProviderMessage } from "./ai.provider.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";
import { AIEmptyResponseError } from "./ai.errors.js";
import { runAiCall } from "./ai.callRunner.js";

type ExecuteAIParams = {
  provider: AIProvider;
  systemPrompt: string;
  messages: AIProviderMessage[];
  action: "generate" | "improve";
  tenantId: string;
  userId: string;
  conversationId: string;
  model: string;
  abortSignal?: AbortSignal;
};

type ExecuteAIResult = {
  text: string;
};

export async function executeAI(
  params: ExecuteAIParams,
): Promise<ExecuteAIResult> {
  const {
    provider,
    systemPrompt,
    messages,
    action,
    tenantId,
    userId,
    conversationId,
    model,
    abortSignal,
  } = params;

  return runAiCall({
    action,
    tenantId,
    userId,
    conversationId,
    model,
    abortSignal,
    providerCall: async () => {
      const result = await provider.generateText({
        systemPrompt,
        messages,
        model,
        abortSignal,
      });
      return {
        result: result.text,
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        finishReason: result.finishReason,
      };
    },
    parse: (text) => {
      if (!text || text.trim() === "") {
        throw new AIEmptyResponseError("AI returned an empty response");
      }
      return { text: sanitizeAiMarkdown(text) };
    },
  });
}
