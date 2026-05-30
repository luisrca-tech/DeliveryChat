import { eq } from "drizzle-orm";
import { db, type DbExecutor } from "../../db/index.js";
import { applications } from "../../db/schema/applications.js";
import { runAICall } from "./ai.callOrchestrator.js";
import {
  MissingTopicsError,
  SummaryGenerationFailedError,
  TurnConflictError,
} from "./ai.errors.js";
import { generateInterviewSummary } from "./ai.summaryGenerator.js";
import {
  InterviewTurnEngine,
  type AdvanceDecision,
  type BootstrapPersistDecision,
  type TurnDecision,
} from "./ai.interview.engine.js";
import {
  createInterviewRepository,
  type InterviewRepository,
} from "./ai.interview.repository.js";
import {
  FORCED_COMPLETION_FINISH_REASON,
  interviewerOutputSchema,
  type InterviewContextRow,
  type InterviewerOutput,
} from "./ai.interview.schema.js";
import {
  INTERVIEW_MODEL,
  INTERVIEWER_SYSTEM_PROMPT,
} from "./ai.prompts.interview.js";
import type { AIProviderPort } from "./ai.providerPort.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";

export type TurnResult = {
  row: InterviewContextRow;
  output: InterviewerOutput;
  canFinish: boolean;
};

export type RunTurnParams = {
  provider: AIProviderPort;
  applicationId: string;
  tenantId: string;
  userId: string;
  message: string;
  expectedCurrentTurn: number;
};

export type RunCompleteParams = {
  applicationId: string;
  userId: string;
  expectedCurrentTurn: number;
};

export type RunGenerateSummaryParams = {
  provider: AIProviderPort;
  applicationId: string;
  tenantId: string;
  userId: string;
};

function sanitizeOutput(o: InterviewerOutput): InterviewerOutput {
  return { ...o, assistantMessage: sanitizeAiMarkdown(o.assistantMessage) };
}

async function callInterviewerLlm(
  provider: AIProviderPort,
  messages: ReturnType<typeof InterviewTurnEngine.buildAdvanceMessages>,
) {
  return provider.generateObject({
    systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
    messages,
    model: INTERVIEW_MODEL,
    schema: interviewerOutputSchema,
  });
}

export async function getInterviewContext(
  applicationId: string,
): Promise<InterviewContextRow | null> {
  return createInterviewRepository(db).loadByApplicationId(applicationId);
}

export async function runInterviewTurn(
  params: RunTurnParams,
): Promise<TurnResult> {
  const {
    provider,
    applicationId,
    tenantId,
    userId,
    message,
    expectedCurrentTurn,
  } = params;

  return db.transaction(async (tx) => {
    const repo = createInterviewRepository(tx);
    const trimmedMessage = message.trim();
    const isBootstrap =
      expectedCurrentTurn === 0 && trimmedMessage === "";
    const row = await repo.loadOrInit(applicationId);

    if (!isBootstrap) {
      if (
        row.status !== "in_progress" ||
        row.currentTurn !== expectedCurrentTurn
      ) {
        throw new TurnConflictError(row.currentTurn, row.status);
      }

      if (InterviewTurnEngine.shouldForceCompletion(row)) {
        return runForcedCompletion(tx, repo, row, {
          tenantId,
          userId,
          message: trimmedMessage,
          expectedCurrentTurn,
        });
      }
    }

    return runLlmTurn(tx, repo, provider, row, isBootstrap, {
      tenantId,
      userId,
      message: trimmedMessage,
      expectedCurrentTurn,
    });
  });
}

type LlmTurnParams = {
  tenantId: string;
  userId: string;
  message: string;
  expectedCurrentTurn: number;
};

async function runForcedCompletion(
  tx: DbExecutor,
  repo: InterviewRepository,
  row: InterviewContextRow,
  params: LlmTurnParams,
): Promise<TurnResult> {
  const decision = InterviewTurnEngine.next(row, {
    kind: "forced_completion",
    expectedCurrentTurn: params.expectedCurrentTurn,
    userMessage: params.message,
    nowIso: new Date().toISOString(),
  });
  if (decision.kind === "conflict") {
    throw new TurnConflictError(decision.currentTurn, decision.status);
  }
  if (decision.kind !== "forced_completion") {
    throw new Error(`unexpected forced decision: ${decision.kind}`);
  }

  const updated = await repo.applyForcedCompletion(
    row.id,
    params.userId,
    decision,
  );

  await runAICall<null, null>({
    action: "interview_forced_completion",
    tenantId: params.tenantId,
    userId: params.userId,
    conversationId: null,
    model: INTERVIEW_MODEL,
    tx,
    providerCall: async () => ({
      result: null,
      inputTokens: 0,
      outputTokens: 0,
      finishReason: FORCED_COMPLETION_FINISH_REASON,
    }),
    parse: (v) => v,
  });

  console.warn("[ai.interviewer] forced completion at turn cap", {
    applicationId: row.applicationId,
    userId: params.userId,
    currentTurn: row.currentTurn,
  });

  return {
    row: updated,
    output: decision.output,
    canFinish: true,
  };
}

async function runLlmTurn(
  tx: DbExecutor,
  repo: InterviewRepository,
  provider: AIProviderPort,
  row: InterviewContextRow,
  isBootstrap: boolean,
  params: LlmTurnParams,
): Promise<TurnResult> {
  const baseMessages = isBootstrap
    ? InterviewTurnEngine.buildBootstrapMessages()
    : InterviewTurnEngine.buildAdvanceMessages(
        row.interviewLog,
        params.message,
        row.currentTurn,
      );

  const decision = await runAICall<TurnDecision, TurnDecision>({
    action: "interview",
    tenantId: params.tenantId,
    userId: params.userId,
    conversationId: null,
    model: INTERVIEW_MODEL,
    tx,
    providerCall: async () => {
      const first = await callInterviewerLlm(provider, baseMessages);
      let totalIn = first.usage.promptTokens;
      let totalOut = first.usage.completionTokens;
      let finalFinish = first.finishReason;

      const sanitizedFirst = sanitizeOutput(first.object);
      let next: TurnDecision = isBootstrap
        ? InterviewTurnEngine.next(row, {
            kind: "bootstrap",
            llmOutput: sanitizedFirst,
          })
        : InterviewTurnEngine.next(row, {
            kind: "advance",
            expectedCurrentTurn: params.expectedCurrentTurn,
            userMessage: params.message,
            llmOutput: sanitizedFirst,
            baseMessages,
          });

      if (next.kind === "needs_reprompt") {
        const retry = await callInterviewerLlm(provider, next.repromptMessages);
        totalIn += retry.usage.promptTokens;
        totalOut += retry.usage.completionTokens;
        finalFinish = retry.finishReason;
        const sanitizedRetry = sanitizeOutput(retry.object);
        next = InterviewTurnEngine.next(row, {
          kind: "advance_after_reprompt",
          expectedCurrentTurn: params.expectedCurrentTurn,
          userMessage: params.message,
          llmOutput: sanitizedRetry,
          originalGuardrailAction: sanitizedFirst.guardrailAction,
        });
      }

      return {
        result: next,
        inputTokens: totalIn,
        outputTokens: totalOut,
        finishReason: finalFinish,
      };
    },
    parse: (d) => d,
  });

  if (decision.kind === "conflict") {
    throw new TurnConflictError(decision.currentTurn, decision.status);
  }

  if (decision.kind === "bootstrap_already_done") {
    return {
      row,
      output: decision.output,
      canFinish: decision.canFinish,
    };
  }

  if (decision.kind === "bootstrap_persist") {
    const persisted = decision as BootstrapPersistDecision;
    const updated = await repo.applyBootstrap(row.id, persisted);
    return {
      row: updated,
      output: persisted.output,
      canFinish: persisted.canFinish,
    };
  }

  if (decision.kind === "advance") {
    const advance = decision as AdvanceDecision;
    const updated = await repo.applyAdvance(row.id, advance);
    return {
      row: updated,
      output: advance.output,
      canFinish: advance.canFinish,
    };
  }

  throw new Error(`unexpected turn decision: ${decision.kind}`);
}

export async function runInterviewComplete(
  params: RunCompleteParams,
): Promise<{ row: InterviewContextRow }> {
  return db.transaction(async (tx) => {
    const repo = createInterviewRepository(tx);
    const row = await repo.loadByApplicationId(params.applicationId);

    const decision = InterviewTurnEngine.complete(row, {
      expectedCurrentTurn: params.expectedCurrentTurn,
      nowIso: new Date().toISOString(),
    });

    if (decision.kind === "conflict") {
      throw new TurnConflictError(decision.currentTurn, decision.status);
    }
    if (decision.kind === "missing_topics") {
      throw new MissingTopicsError(decision.missing);
    }

    const updated = await repo.markCompleted(
      row!.id,
      params.userId,
      decision.completedAt,
    );
    return { row: updated };
  });
}

export async function runGenerateSummary(
  params: RunGenerateSummaryParams,
): Promise<{ row: InterviewContextRow }> {
  const repo = createInterviewRepository(db);
  const row = await repo.loadByApplicationId(params.applicationId);
  if (!row) {
    throw new SummaryGenerationFailedError(
      "Interview row not found for application",
    );
  }
  if (row.status !== "completed") {
    throw new SummaryGenerationFailedError(
      `Interview is not completed (status=${row.status})`,
    );
  }

  const appRows = await db
    .select({ name: applications.name })
    .from(applications)
    .where(eq(applications.id, params.applicationId))
    .limit(1);
  const applicationName = appRows[0]?.name;
  if (!applicationName) {
    throw new SummaryGenerationFailedError("Application not found");
  }

  let summary: string;
  try {
    summary = await generateInterviewSummary({
      provider: params.provider,
      tenantId: params.tenantId,
      userId: params.userId,
      applicationName,
      interviewLog: row.interviewLog,
    });
  } catch (error) {
    throw new SummaryGenerationFailedError(
      error instanceof Error ? error.message : "Summary generation failed",
      { cause: error },
    );
  }

  return db.transaction(async (tx) => {
    const txRepo = createInterviewRepository(tx);
    const updated = await txRepo.applyContextSummary(row.id, summary);
    await tx
      .update(applications)
      .set({ aiEnabled: true })
      .where(eq(applications.id, params.applicationId));
    return { row: updated };
  });
}
