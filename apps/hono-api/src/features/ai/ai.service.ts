import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { messages } from "../../db/schema/messages.js";
import { conversations } from "../../db/schema/conversations.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { user } from "../../db/schema/users.js";
import { env } from "../../env.js";
import { createAIProvider } from "./ai.provider.js";
import { buildContext, buildSystemPrompt, buildImprovePrompt } from "./ai.context.js";
import {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
  AIConversationNotFoundError,
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

type ImproveMessageInput = {
  conversationId: string;
  draft: string;
  operatorId: string;
  tenantId: string;
  tenantName: string;
  abortSignal?: AbortSignal;
};

type ImproveMessageResult = {
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
  if (error instanceof AIProviderRateLimitError) return false;
  if (error instanceof AIProviderError) return true;
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyConversationOwnership(
  conversationId: string,
  tenantId: string,
): Promise<void> {
  const result = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, tenantId),
      ),
    )
    .limit(1);

  if (result.length === 0) {
    throw new AIConversationNotFoundError("Conversation not found");
  }
}

export async function generateReply(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  await verifyConversationOwnership(input.conversationId, input.tenantId);

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
          status: error instanceof AITimeoutError ? "timeout" : "provider_error",
        });
        throw error;
      }
    }
  }

  throw lastError;
}

const IMPROVE_CONTEXT_LIMIT = 3;

export async function improveMessage(
  input: ImproveMessageInput,
): Promise<ImproveMessageResult> {
  await verifyConversationOwnership(input.conversationId, input.tenantId);

  const model = env.AI_MODEL;
  const provider = createAIProvider(model, env.GROQ_API_KEY);

  const conversationMessages = await db
    .select({
      senderId: messages.senderId,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, input.conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(IMPROVE_CONTEXT_LIMIT);

  const orderedMessages = conversationMessages.reverse();
  const contextMessages = buildContext(orderedMessages, input.operatorId);

  contextMessages.push({
    role: "user",
    content: `[Operator draft to improve] ${input.draft}`,
  });

  const systemPrompt = buildImprovePrompt(input.tenantName);

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
          action: "improve",
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
          action: "improve",
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
        action: "improve",
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

      if (error instanceof Error && error.name === "AbortError") {
        await logUsage({
          tenantId: input.tenantId,
          userId: input.operatorId,
          action: "improve",
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
          action: "improve",
          conversationId: input.conversationId,
          model,
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

type GetAiUsageLogsInput = {
  tenantId: string;
  limit: number;
  offset: number;
  action?: string;
  status?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type AiUsageLogEntry = {
  id: string;
  tenantId: string;
  userId: string;
  operatorName: string | null;
  action: string;
  conversationId: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  finishReason: string | null;
  status: string;
  createdAt: string;
};

type GetAiUsageLogsResult = {
  logs: AiUsageLogEntry[];
  total: number;
};

export async function getAiUsageLogs(
  input: GetAiUsageLogsInput,
): Promise<GetAiUsageLogsResult> {
  const conditions = [eq(aiUsageLog.tenantId, input.tenantId)];

  if (input.action) {
    conditions.push(
      eq(aiUsageLog.action, input.action as "generate" | "improve"),
    );
  }
  if (input.status) {
    conditions.push(
      eq(
        aiUsageLog.status,
        input.status as
          | "success"
          | "provider_error"
          | "timeout"
          | "empty"
          | "content_filtered"
          | "aborted",
      ),
    );
  }
  if (input.userId) {
    conditions.push(eq(aiUsageLog.userId, input.userId));
  }
  if (input.dateFrom) {
    conditions.push(gte(aiUsageLog.createdAt, input.dateFrom));
  }
  if (input.dateTo) {
    conditions.push(lte(aiUsageLog.createdAt, input.dateTo));
  }

  const whereClause = and(...conditions);

  const [logs, countResult] = await Promise.all([
    db
      .select({
        id: aiUsageLog.id,
        tenantId: aiUsageLog.tenantId,
        userId: aiUsageLog.userId,
        operatorName: user.name,
        action: aiUsageLog.action,
        conversationId: aiUsageLog.conversationId,
        model: aiUsageLog.model,
        inputTokens: aiUsageLog.inputTokens,
        outputTokens: aiUsageLog.outputTokens,
        latencyMs: aiUsageLog.latencyMs,
        finishReason: aiUsageLog.finishReason,
        status: aiUsageLog.status,
        createdAt: aiUsageLog.createdAt,
      })
      .from(aiUsageLog)
      .leftJoin(user, eq(aiUsageLog.userId, user.id))
      .where(whereClause)
      .orderBy(desc(aiUsageLog.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiUsageLog)
      .where(whereClause),
  ]);

  return {
    logs,
    total: countResult[0]?.count ?? 0,
  };
}
