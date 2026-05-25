import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { messages } from "../../db/schema/messages.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { env } from "../../env.js";
import { createAIProvider } from "./ai.provider.js";
import { buildContext, buildSystemPrompt } from "./ai.context.js";
import {
  AIProviderError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
} from "./ai.errors.js";

type GenerateReplyInput = {
  conversationId: string;
  operatorId: string;
  tenantId: string;
  tenantName: string;
  abortSignal?: AbortSignal;
};

type GenerateReplyResult = {
  text: string;
};

type UsageStatus =
  | "success"
  | "provider_error"
  | "timeout"
  | "empty"
  | "content_filtered"
  | "aborted";

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
  if (error instanceof AIProviderError) return true;
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateReply(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  const model = env.AI_MODEL;
  const provider = createAIProvider(model, env.GROQ_API_KEY);
  const limit = env.AI_CONTEXT_MESSAGE_LIMIT;

  const conversationMessages = await db
    .select({
      senderId: messages.senderId,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, input.conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const orderedMessages = conversationMessages.reverse();
  const contextMessages = buildContext(orderedMessages, input.operatorId);
  const systemPrompt = buildSystemPrompt(input.tenantName);

  const startTime = Date.now();
  let lastError: unknown = null;
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(1000);
      }

      const result = await provider.generateText({
        systemPrompt,
        messages: contextMessages,
        model,
        abortSignal: input.abortSignal,
      });

      const latencyMs = Date.now() - startTime;

      if (result.finishReason === "content-filter") {
        await logUsage({
          tenantId: input.tenantId,
          userId: input.operatorId,
          action: "generate",
          conversationId: input.conversationId,
          model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          latencyMs,
          finishReason: result.finishReason,
          status: "content_filtered",
        });
        throw new AIContentFilteredError(
          "AI response was blocked by content filter",
        );
      }

      if (!result.text || result.text.trim() === "") {
        await logUsage({
          tenantId: input.tenantId,
          userId: input.operatorId,
          action: "generate",
          conversationId: input.conversationId,
          model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          latencyMs,
          finishReason: result.finishReason,
          status: "empty",
        });
        throw new AIEmptyResponseError("AI returned an empty response");
      }

      await logUsage({
        tenantId: input.tenantId,
        userId: input.operatorId,
        action: "generate",
        conversationId: input.conversationId,
        model,
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        latencyMs,
        finishReason: result.finishReason,
        status: "success",
      });

      return { text: result.text };
    } catch (error) {
      lastError = error;

      if (
        error instanceof AIEmptyResponseError ||
        error instanceof AIContentFilteredError
      ) {
        throw error;
      }

      if (error instanceof AITimeoutError) {
        await logUsage({
          tenantId: input.tenantId,
          userId: input.operatorId,
          action: "generate",
          conversationId: input.conversationId,
          model,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startTime,
          finishReason: null,
          status: "timeout",
        });
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        await logUsage({
          tenantId: input.tenantId,
          userId: input.operatorId,
          action: "generate",
          conversationId: input.conversationId,
          model,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startTime,
          finishReason: null,
          status: "aborted",
        });
        throw error;
      }

      if (!isRetryable(error) || attempt === maxAttempts - 1) {
        await logUsage({
          tenantId: input.tenantId,
          userId: input.operatorId,
          action: "generate",
          conversationId: input.conversationId,
          model,
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - startTime,
          finishReason: null,
          status: "provider_error",
        });
        throw error;
      }
    }
  }

  throw lastError;
}
