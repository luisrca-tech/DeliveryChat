import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { applicationAiContext } from "../../db/schema/applicationAiContext.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";
import { MissingTopicsError, TurnConflictError } from "./ai.errors.js";
import {
  INTERVIEW_MODEL,
  INTERVIEWER_SYSTEM_PROMPT,
} from "./ai.prompts.interview.js";
import {
  buildAdvanceMessages,
  buildBootstrapMessages,
  InterviewTurnEngine,
} from "./ai.interview.engine.js";
import {
  FORCED_COMPLETION_FINISH_REASON,
  interviewerOutputSchema,
  type InterviewContextRow,
  type InterviewerOutput,
} from "./ai.interview.schema.js";
import type { AIProvider } from "./ai.provider.js";

export {
  CORE_TOPICS,
  FORCED_COMPLETION_FINISH_REASON,
  MAX_TURNS,
  computeCoveredTopics,
  interviewerOutputSchema,
  type CoreTopic,
  type InterviewContextRow,
  type InterviewLogEntry,
  type InterviewerOutput,
} from "./ai.interview.schema.js";
export { MissingTopicsError, TurnConflictError } from "./ai.errors.js";
export {
  INTERVIEW_MODEL,
  INTERVIEWER_SYSTEM_PROMPT,
} from "./ai.prompts.interview.js";

type FindOrCreateDeps = {
  tx?: typeof db;
};

export async function findOrCreateInterviewContext(
  applicationId: string,
  deps: FindOrCreateDeps = {},
): Promise<InterviewContextRow> {
  const executor = deps.tx ?? db;

  const existing = await executor
    .select()
    .from(applicationAiContext)
    .where(eq(applicationAiContext.applicationId, applicationId))
    .limit(1);

  if (existing[0]) {
    return existing[0] as InterviewContextRow;
  }

  const [created] = await executor
    .insert(applicationAiContext)
    .values({ applicationId })
    .returning();

  return created as InterviewContextRow;
}

export async function getInterviewContext(
  applicationId: string,
): Promise<InterviewContextRow | null> {
  const rows = await db
    .select()
    .from(applicationAiContext)
    .where(eq(applicationAiContext.applicationId, applicationId))
    .limit(1);

  return (rows[0] as InterviewContextRow | undefined) ?? null;
}

type RunBootstrapTurnParams = {
  provider: AIProvider;
  applicationId: string;
  tenantId: string;
  userId: string;
};

type RunTurnResult = {
  row: InterviewContextRow;
  output: InterviewerOutput;
  canFinish: boolean;
};

type RunAdvanceTurnParams = {
  provider: AIProvider;
  applicationId: string;
  tenantId: string;
  userId: string;
  userMessage: string;
  expectedCurrentTurn: number;
};

function sanitizeOutput(o: InterviewerOutput): InterviewerOutput {
  return { ...o, assistantMessage: sanitizeAiMarkdown(o.assistantMessage) };
}

export async function runBootstrapTurn(
  params: RunBootstrapTurnParams,
): Promise<RunTurnResult> {
  const { provider, applicationId, tenantId, userId } = params;
  const startTime = Date.now();

  return db.transaction(async (tx) => {
    const txd = tx as unknown as typeof db;
    const row = await findOrCreateInterviewContext(applicationId, {
      tx: txd,
    });

    if (row.currentTurn !== 0 || row.interviewLog.length > 0) {
      const already = InterviewTurnEngine.next(row, {
        kind: "bootstrap",
        llmOutput: {
          assistantMessage: row.interviewLog[0]?.content ?? "placeholder",
          intent: "ask",
          topicsCoveredThisTurn: [],
          guardrailAction: "none",
        },
      });
      if (already.kind === "bootstrap_already_done") {
        return {
          row,
          output: already.output,
          canFinish: already.canFinish,
        };
      }
    }

    const llm = await provider.generateObject({
      systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
      messages: buildBootstrapMessages(),
      model: INTERVIEW_MODEL,
      schema: interviewerOutputSchema,
    });

    const sanitized = sanitizeOutput(llm.object);
    const decision = InterviewTurnEngine.next(row, {
      kind: "bootstrap",
      llmOutput: sanitized,
    });

    if (decision.kind === "bootstrap_already_done") {
      return {
        row,
        output: decision.output,
        canFinish: decision.canFinish,
      };
    }
    if (decision.kind !== "bootstrap_persist") {
      throw new Error(`unexpected bootstrap decision: ${decision.kind}`);
    }

    const [updated] = await txd
      .update(applicationAiContext)
      .set({ interviewLog: decision.nextLog })
      .where(eq(applicationAiContext.id, row.id))
      .returning();

    await txd.insert(aiUsageLog).values({
      tenantId,
      userId,
      action: "interview",
      conversationId: null,
      model: INTERVIEW_MODEL,
      inputTokens: llm.usage.promptTokens,
      outputTokens: llm.usage.completionTokens,
      latencyMs: Date.now() - startTime,
      finishReason: llm.finishReason,
      status: "success",
    });

    return {
      row: updated as InterviewContextRow,
      output: decision.output,
      canFinish: decision.canFinish,
    };
  });
}

export async function runAdvanceTurn(
  params: RunAdvanceTurnParams,
): Promise<RunTurnResult> {
  const {
    provider,
    applicationId,
    tenantId,
    userId,
    userMessage,
    expectedCurrentTurn,
  } = params;
  const startTime = Date.now();

  return db.transaction(async (tx) => {
    const txd = tx as unknown as typeof db;

    const rows = await txd
      .select()
      .from(applicationAiContext)
      .where(eq(applicationAiContext.applicationId, applicationId))
      .limit(1);
    const row = (rows[0] as InterviewContextRow | undefined) ?? null;

    if (!row) {
      throw new TurnConflictError(0, "not_started");
    }

    if (
      row.status !== "in_progress" ||
      row.currentTurn !== expectedCurrentTurn
    ) {
      throw new TurnConflictError(row.currentTurn, row.status);
    }

    if (InterviewTurnEngine.shouldForceCompletion(row)) {
      const forced = InterviewTurnEngine.next(row, {
        kind: "forced_completion",
        expectedCurrentTurn,
        userMessage,
        nowIso: new Date().toISOString(),
      });
      if (forced.kind === "conflict") {
        throw new TurnConflictError(forced.currentTurn, forced.status);
      }
      if (forced.kind !== "forced_completion") {
        throw new Error(`unexpected forced decision: ${forced.kind}`);
      }

      const [updated] = await txd
        .update(applicationAiContext)
        .set({
          interviewLog: forced.nextLog,
          status: "completed",
          completedBy: userId,
          completedAt: forced.completedAt,
        })
        .where(eq(applicationAiContext.id, row.id))
        .returning();

      await txd.insert(aiUsageLog).values({
        tenantId,
        userId,
        action: "interview",
        conversationId: null,
        model: INTERVIEW_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        finishReason: FORCED_COMPLETION_FINISH_REASON,
        status: "success",
      });

      console.warn("[ai.interviewer] forced completion at turn cap", {
        applicationId,
        userId,
        currentTurn: row.currentTurn,
      });

      return {
        row: updated as InterviewContextRow,
        output: forced.output,
        canFinish: true,
      };
    }

    const baseMessages = buildAdvanceMessages(
      row.interviewLog,
      userMessage,
      row.currentTurn,
    );

    const llm = await provider.generateObject({
      systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
      messages: baseMessages,
      model: INTERVIEW_MODEL,
      schema: interviewerOutputSchema,
    });

    let totalPromptTokens = llm.usage.promptTokens;
    let totalCompletionTokens = llm.usage.completionTokens;
    let finalFinishReason = llm.finishReason;

    const sanitized = sanitizeOutput(llm.object);
    let decision = InterviewTurnEngine.next(row, {
      kind: "advance",
      expectedCurrentTurn,
      userMessage,
      llmOutput: sanitized,
      baseMessages,
    });

    if (decision.kind === "conflict") {
      throw new TurnConflictError(decision.currentTurn, decision.status);
    }

    if (decision.kind === "needs_reprompt") {
      const retry = await provider.generateObject({
        systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
        messages: decision.repromptMessages,
        model: INTERVIEW_MODEL,
        schema: interviewerOutputSchema,
      });
      totalPromptTokens += retry.usage.promptTokens;
      totalCompletionTokens += retry.usage.completionTokens;
      finalFinishReason = retry.finishReason;

      const sanitizedRetry = sanitizeOutput(retry.object);
      decision = InterviewTurnEngine.next(row, {
        kind: "advance_after_reprompt",
        expectedCurrentTurn,
        userMessage,
        llmOutput: sanitizedRetry,
        originalGuardrailAction: sanitized.guardrailAction,
      });
      if (decision.kind === "conflict") {
        throw new TurnConflictError(decision.currentTurn, decision.status);
      }
    }

    if (decision.kind !== "advance") {
      throw new Error(`unexpected advance decision: ${decision.kind}`);
    }

    const [updated] = await txd
      .update(applicationAiContext)
      .set({ interviewLog: decision.nextLog, currentTurn: decision.nextTurn })
      .where(eq(applicationAiContext.id, row.id))
      .returning();

    await txd.insert(aiUsageLog).values({
      tenantId,
      userId,
      action: "interview",
      conversationId: null,
      model: INTERVIEW_MODEL,
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
      latencyMs: Date.now() - startTime,
      finishReason: finalFinishReason,
      status: "success",
    });

    return {
      row: updated as InterviewContextRow,
      output: decision.output,
      canFinish: decision.canFinish,
    };
  });
}

type RunCompleteInterviewParams = {
  applicationId: string;
  userId: string;
  expectedCurrentTurn: number;
};

type RunCompleteInterviewResult = {
  row: InterviewContextRow;
};

export async function runCompleteInterview(
  params: RunCompleteInterviewParams,
): Promise<RunCompleteInterviewResult> {
  const { applicationId, userId, expectedCurrentTurn } = params;

  return db.transaction(async (tx) => {
    const txd = tx as unknown as typeof db;

    const rows = await txd
      .select()
      .from(applicationAiContext)
      .where(eq(applicationAiContext.applicationId, applicationId))
      .limit(1);
    const row = (rows[0] as InterviewContextRow | undefined) ?? null;

    const decision = InterviewTurnEngine.complete(row, {
      expectedCurrentTurn,
      nowIso: new Date().toISOString(),
    });

    if (decision.kind === "conflict") {
      throw new TurnConflictError(decision.currentTurn, decision.status);
    }
    if (decision.kind === "missing_topics") {
      throw new MissingTopicsError(decision.missing);
    }

    const [updated] = await txd
      .update(applicationAiContext)
      .set({
        status: "completed",
        completedBy: userId,
        completedAt: decision.completedAt,
      })
      .where(eq(applicationAiContext.id, row!.id))
      .returning();

    return { row: updated as InterviewContextRow };
  });
}
