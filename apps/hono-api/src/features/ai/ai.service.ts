import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { messages } from "../../db/schema/messages.js";
import { conversations } from "../../db/schema/conversations.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { user } from "../../db/schema/users.js";
import { applications } from "../../db/schema/applications.js";
import { applicationAiContext } from "../../db/schema/applicationAiContext.js";
import { env } from "../../env.js";
import { createAIProvider } from "./ai.groqProvider.js";
import { buildContext, buildSystemPrompt } from "./ai.context.js";
import { enrichMessage } from "../chat/chat.service.js";
import { runAICall } from "./ai.callOrchestrator.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";
import {
  AIConversationNotFoundError,
  AIApplicationRequiredError,
  AIEmptyResponseError,
  AINotConfiguredError,
} from "./ai.errors.js";
import type { AIProviderMessage } from "./ai.providerPort.js";

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

async function verifyConversationOwnership(
  conversationId: string,
  tenantId: string,
): Promise<{ applicationId: string | null }> {
  const result = await db
    .select({
      id: conversations.id,
      applicationId: conversations.applicationId,
    })
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

  return { applicationId: result[0]!.applicationId };
}

function requireApplicationId(
  applicationId: string | null,
): asserts applicationId is string {
  if (!applicationId) {
    throw new AIApplicationRequiredError(
      "AI requires a conversation linked to an application.",
    );
  }
}

async function requireApplicationAiContext(
  applicationId: string,
): Promise<string | undefined> {
  const result = await db
    .select({
      aiEnabled: applications.aiEnabled,
      contextSummary: applicationAiContext.contextSummary,
    })
    .from(applications)
    .leftJoin(
      applicationAiContext,
      and(
        eq(applicationAiContext.applicationId, applications.id),
        eq(applicationAiContext.status, "completed"),
      ),
    )
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!result[0] || !result[0].aiEnabled) {
    throw new AINotConfiguredError(
      "AI is not available for this application. Contact your admin to complete the AI onboarding interview.",
    );
  }

  return result[0].contextSummary ?? undefined;
}

export async function generateReply(
  input: GenerateReplyInput,
): Promise<GenerateReplyResult> {
  const { applicationId } = await verifyConversationOwnership(
    input.conversationId,
    input.tenantId,
  );
  requireApplicationId(applicationId);

  const model = env.AI_MODEL;
  const provider = createAIProvider(model, env.GROQ_API_KEY);
  const limit = env.AI_CONTEXT_MESSAGE_LIMIT;

  const [rawMessages, contextSummary] = await Promise.all([
    db
      .select({
        senderId: messages.senderId,
        content: messages.content,
        contentFormat: messages.contentFormat,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit),
    requireApplicationAiContext(applicationId),
  ]);

  const orderedMessages = rawMessages.reverse().map(enrichMessage);
  const contextMessages = buildContext(orderedMessages, input.operatorId);
  const systemPrompt = buildSystemPrompt({
    action: "generate",
    tenantName: input.tenantName,
    contextSummary,
  });
  const guidedMessages = anchorOnUserTurn(contextMessages);

  return runOperatorTextCall({
    provider,
    systemPrompt,
    messages: guidedMessages,
    action: "generate",
    tenantId: input.tenantId,
    userId: input.operatorId,
    conversationId: input.conversationId,
    model,
    abortSignal: input.abortSignal,
  });
}

const FOLLOW_UP_DRAFT_INSTRUCTION =
  "[System] Draft the next operator reply that follows on from the conversation above. Keep it concise and return only the message text.";

const OPENING_DRAFT_INSTRUCTION =
  "[System] The conversation has no messages yet. Draft an opening message the operator can send to greet the visitor and offer help. Keep it concise and return only the message text.";

function anchorOnUserTurn(
  contextMessages: AIProviderMessage[],
): AIProviderMessage[] {
  // Every provider call needs at least one user turn: handing the model an
  // empty message list throws AI_InvalidPromptError (surfacing as a 502).
  const last = contextMessages[contextMessages.length - 1];
  if (!last) {
    return [{ role: "user", content: OPENING_DRAFT_INSTRUCTION }];
  }
  if (last.role !== "assistant") return contextMessages;
  return [
    ...contextMessages,
    { role: "user", content: FOLLOW_UP_DRAFT_INSTRUCTION },
  ];
}

type RunOperatorTextCallParams = {
  provider: ReturnType<typeof createAIProvider>;
  systemPrompt: string;
  messages: AIProviderMessage[];
  action: "generate" | "improve";
  tenantId: string;
  userId: string;
  conversationId: string;
  model: string;
  abortSignal?: AbortSignal;
};

function runOperatorTextCall(
  params: RunOperatorTextCallParams,
): Promise<{ text: string }> {
  const { provider, systemPrompt, messages, abortSignal, model } = params;
  return runAICall<string, { text: string }>({
    action: params.action,
    tenantId: params.tenantId,
    userId: params.userId,
    conversationId: params.conversationId,
    model,
    abortSignal,
    providerCall: async () => {
      const r = await provider.generateText({
        systemPrompt,
        messages,
        model,
        abortSignal,
      });
      return {
        result: r.text,
        inputTokens: r.usage.promptTokens,
        outputTokens: r.usage.completionTokens,
        finishReason: r.finishReason,
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

const IMPROVE_CONTEXT_LIMIT = 3;

export async function improveMessage(
  input: ImproveMessageInput,
): Promise<ImproveMessageResult> {
  const { applicationId } = await verifyConversationOwnership(
    input.conversationId,
    input.tenantId,
  );
  requireApplicationId(applicationId);

  const model = env.AI_MODEL;
  const provider = createAIProvider(model, env.GROQ_API_KEY);

  const [rawMessages, contextSummary] = await Promise.all([
    db
      .select({
        senderId: messages.senderId,
        content: messages.content,
        contentFormat: messages.contentFormat,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(IMPROVE_CONTEXT_LIMIT),
    requireApplicationAiContext(applicationId),
  ]);

  const orderedMessages = rawMessages.reverse().map(enrichMessage);
  const contextMessages = buildContext(orderedMessages, input.operatorId);

  contextMessages.push({
    role: "user",
    content: `[Operator draft to improve] ${input.draft}`,
  });

  const systemPrompt = buildSystemPrompt({
    action: "improve",
    tenantName: input.tenantName,
    contextSummary,
  });

  return runOperatorTextCall({
    provider,
    systemPrompt,
    messages: contextMessages,
    action: "improve",
    tenantId: input.tenantId,
    userId: input.operatorId,
    conversationId: input.conversationId,
    model,
    abortSignal: input.abortSignal,
  });
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
    const endOfDay = input.dateTo.includes("T")
      ? input.dateTo
      : `${input.dateTo}T23:59:59.999Z`;
    conditions.push(lte(aiUsageLog.createdAt, endOfDay));
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
