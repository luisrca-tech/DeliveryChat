import { db } from "../../db/index.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { runAiCall } from "./ai.callRunner.js";
import { MissingTopicsError, TurnConflictError } from "./ai.errors.js";
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
import type { AIProvider } from "./ai.provider.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";

export type TurnResult = {
  row: InterviewContextRow;
  output: InterviewerOutput;
  canFinish: boolean;
};

export type RunTurnParams = {
  provider: AIProvider;
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

function sanitizeOutput(o: InterviewerOutput): InterviewerOutput {
  return { ...o, assistantMessage: sanitizeAiMarkdown(o.assistantMessage) };
}

async function callInterviewerLlm(
  provider: AIProvider,
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
    const txd = tx as unknown as typeof db;
    const repo = createInterviewRepository(txd);
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
        return runForcedCompletion(txd, repo, row, {
          tenantId,
          userId,
          message: trimmedMessage,
          expectedCurrentTurn,
        });
      }
    }

    return runLlmTurn(txd, repo, provider, row, isBootstrap, {
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
  tx: typeof db,
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

  await tx.insert(aiUsageLog).values({
    tenantId: params.tenantId,
    userId: params.userId,
    action: "interview",
    conversationId: null,
    model: INTERVIEW_MODEL,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    finishReason: FORCED_COMPLETION_FINISH_REASON,
    status: "success",
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
  tx: typeof db,
  repo: InterviewRepository,
  provider: AIProvider,
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

  const decision = await runAiCall<TurnDecision, TurnDecision>({
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
    const txd = tx as unknown as typeof db;
    const repo = createInterviewRepository(txd);
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
