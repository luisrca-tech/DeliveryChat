import { db, type DbExecutor } from "../../db/index.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import {
  AIContentFilteredError,
  AIEmptyResponseError,
} from "./ai.errors.js";
import {
  isAbortError,
  isRetryable,
  isTerminal,
  usageStatusFor,
  type UsageStatus,
} from "./ai.errorPolicy.js";

export type AiCallAction =
  | "generate"
  | "improve"
  | "interview"
  | "interview_summary"
  | "interview_forced_completion"
  | "autonomous_reply"
  | "handoff_summary";

export type AiCallProviderOutcome<TRaw> = {
  result: TRaw;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string | null;
};

export type RunAICallParams<TRaw, TParsed> = {
  action: AiCallAction;
  tenantId: string;
  userId: string;
  conversationId: string | null;
  model: string;
  abortSignal?: AbortSignal;
  providerCall: () => Promise<AiCallProviderOutcome<TRaw>>;
  parse: (raw: TRaw) => TParsed;
  tx?: DbExecutor;
};

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logUsage(
  executor: DbExecutor,
  values: {
    tenantId: string;
    userId: string;
    action: AiCallAction;
    conversationId: string | null;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number | null;
    finishReason: string | null;
    status: UsageStatus;
  },
): Promise<void> {
  try {
    await executor.insert(aiUsageLog).values(values);
  } catch (error) {
    // Usage logging is best-effort — never fail the main request, but surface
    // the failure so a broken aiUsageLog write is not silently invisible.
    console.error("[ai.callOrchestrator] aiUsageLog insert failed", {
      action: values.action,
      tenantId: values.tenantId,
      status: values.status,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runAICall<TRaw, TParsed>(
  params: RunAICallParams<TRaw, TParsed>,
): Promise<TParsed> {
  const executor: DbExecutor = params.tx ?? db;
  const startTime = Date.now();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS);
      }

      const outcome = await params.providerCall();
      const latencyMs = Date.now() - startTime;
      const base = {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        conversationId: params.conversationId,
        model: params.model,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        latencyMs,
        finishReason: outcome.finishReason,
      };

      if (outcome.finishReason === "content-filter") {
        await logUsage(executor, { ...base, status: "content_filtered" });
        throw new AIContentFilteredError(
          "AI response was blocked by content filter",
        );
      }

      let parsed: TParsed;
      try {
        parsed = params.parse(outcome.result);
      } catch (parseError) {
        if (parseError instanceof AIEmptyResponseError) {
          await logUsage(executor, { ...base, status: "empty" });
        }
        throw parseError;
      }

      await logUsage(executor, { ...base, status: "success" });
      return parsed;
    } catch (error) {
      lastError = error;

      if (isTerminal(error)) {
        throw error;
      }

      const failedMeta = {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        conversationId: params.conversationId,
        model: params.model,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - startTime,
        finishReason: null,
      };

      if (isAbortError(error)) {
        await logUsage(executor, { ...failedMeta, status: "aborted" });
        throw error;
      }

      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) {
        await logUsage(executor, {
          ...failedMeta,
          status: usageStatusFor(error),
        });
        throw error;
      }
    }
  }

  throw lastError;
}
