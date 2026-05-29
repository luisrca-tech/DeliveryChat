import type { AIProvider, AIProviderMessage } from "./ai.provider.js";
import { db } from "../../db/index.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";
import {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
} from "./ai.errors.js";

type UsageStatus =
  | "success"
  | "provider_error"
  | "timeout"
  | "empty"
  | "content_filtered"
  | "aborted";

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

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

async function logUsage(params: {
  tenantId: string;
  userId: string;
  action: "generate" | "improve";
  conversationId: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  finishReason: string | null;
  status: UsageStatus;
}): Promise<void> {
  try {
    await db.insert(aiUsageLog).values({
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      conversationId: params.conversationId,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      latencyMs: params.latencyMs,
      finishReason: params.finishReason,
      status: params.status,
    });
  } catch {
    // Usage logging is best-effort — never fail the main request
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AIProviderRateLimitError) return false;
  if (error instanceof AIProviderError) return true;
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeAI(
  params: ExecuteAIParams,
): Promise<ExecuteAIResult> {
  const { provider, systemPrompt, messages, action, tenantId, userId, conversationId, model, abortSignal } = params;

  const startTime = Date.now();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS);
      }

      const result = await provider.generateText({
        systemPrompt,
        messages,
        model,
        abortSignal,
      });

      const latencyMs = Date.now() - startTime;

      if (result.finishReason === "content-filter") {
        await logUsage({
          tenantId, userId, action, conversationId, model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          latencyMs,
          finishReason: result.finishReason,
          status: "content_filtered",
        });
        throw new AIContentFilteredError("AI response was blocked by content filter");
      }

      if (!result.text || result.text.trim() === "") {
        await logUsage({
          tenantId, userId, action, conversationId, model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          latencyMs,
          finishReason: result.finishReason,
          status: "empty",
        });
        throw new AIEmptyResponseError("AI returned an empty response");
      }

      await logUsage({
        tenantId, userId, action, conversationId, model,
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        latencyMs,
        finishReason: result.finishReason,
        status: "success",
      });

      return { text: sanitizeAiMarkdown(result.text) };
    } catch (error) {
      lastError = error;

      if (
        error instanceof AIEmptyResponseError ||
        error instanceof AIContentFilteredError
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        await logUsage({
          tenantId, userId, action, conversationId, model,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startTime,
          finishReason: null,
          status: "aborted",
        });
        throw error;
      }

      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) {
        await logUsage({
          tenantId, userId, action, conversationId, model,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startTime,
          finishReason: null,
          status: error instanceof AITimeoutError ? "timeout" : "provider_error",
        });
        throw error;
      }
    }
  }

  throw lastError;
}
