import { eq } from "drizzle-orm";
import { db, type DbExecutor } from "../../db/index.js";
import { applicationAiContext } from "../../db/schema/applicationAiContext.js";
import { applications } from "../../db/schema/applications.js";
import { runAICall } from "./ai.callOrchestrator.js";
import {
  MissingTopicsError,
  SummaryGenerationFailedError,
  TurnConflictError,
} from "./ai.errors.js";
import {
  CORE_TOPICS,
  coverageAfterAdminReply,
  coverageOfLog,
  FORCED_COMPLETION_FINISH_REASON,
  interviewerOutputSchema,
  MAX_TURNS,
  missingTopics,
  type CoreTopic,
  type EngineMessage,
  type GuardRailAction,
  type InterviewContextRow,
  type InterviewerOutput,
  type InterviewLogEntry,
} from "./ai.interview.schema.js";
import {
  INTERVIEW_MODEL,
  INTERVIEWER_SYSTEM_PROMPT,
} from "./ai.prompts.interview.js";
import type { AIProviderPort } from "./ai.providerPort.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";
import {
  generateInterviewSummary,
  persistSummaryFailed,
  persistSummaryReady,
} from "./ai.summaryGenerator.js";

type GuardRailRules = {
  advanceTurn: boolean;
  persistMarker: "garbage_pushback" | null;
  suppressFinishReprompt: boolean;
};

const GUARD_RAIL_RULES: Record<GuardRailAction, GuardRailRules> = {
  none: {
    advanceTurn: true,
    persistMarker: null,
    suppressFinishReprompt: false,
  },
  redirect_scope: {
    advanceTurn: false,
    persistMarker: null,
    suppressFinishReprompt: true,
  },
  block_extraction: {
    advanceTurn: false,
    persistMarker: null,
    suppressFinishReprompt: true,
  },
  pushback_garbage: {
    advanceTurn: true,
    persistMarker: "garbage_pushback",
    suppressFinishReprompt: false,
  },
  accept_garbage: {
    advanceTurn: true,
    persistMarker: null,
    suppressFinishReprompt: false,
  },
};

export const SOFT_FINISH_WINDOW_MIN = 8;
export const SOFT_FINISH_WINDOW_MAX = 12;

export const SUGGEST_FINISH_CLOSING_MESSAGE =
  "All core topics are covered. Click **Finish interview** when you're ready, or send another message to add more context.";

export const DISCOVERY_PHASE_SYSTEM_MESSAGE = `Discovery phase rules (active because every core topic is already covered and you are past the soft-finish-window minimum):

Every new admin message is "extra context". You must classify it into exactly one of three buckets and set the field 'extraContextRelevance' on your structured output:
- 'relevant': the extra introduces material that would sharpen the support assistant's config (a new prohibited topic, a new audience segment, a new support scenario, a new tone constraint, a new product detail). When relevant, ask exactly one targeted follow-up question that materially sharpens the support config, and set 'followUpQuestion' to true. Never chain multiple questions in one turn.
- 'irrelevant': the extra is about the business operation but does not shape how the support assistant should answer end-user questions. Briefly acknowledge it and do NOT ask a follow-up question. Set 'followUpQuestion' to false. Negative examples that are always 'irrelevant': funding stage, runway, headcount, MRR, internal roadmap, growth metrics.
- 'duplicate': the extra substantially repeats something already captured in the prior interview log, including paraphrased near-duplicates that introduce no new constraint or detail. Acknowledge it as a duplicate, do NOT ask a follow-up question, and set 'followUpQuestion' to false. Compare each new extra against the entire prior log before classifying.

Classification is mutually exclusive: pick one bucket per turn.

Behaviour rules that apply to every classification:
- Author the message yourself; do not fall back to a canned closing line.
- Never name UI elements by label (do not say "click Finish interview", "press the button", etc.). The Finish button is always visible to the admin; trust the UI.
- Never emit raw markdown asterisks in the prose; write naturally.
- Keep any follow-up question concise and tied to what the admin just sent.`;

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

export class InterviewReadPort {
  constructor(private readonly executor: DbExecutor) {}

  async loadByApplicationId(
    applicationId: string,
  ): Promise<InterviewContextRow | null> {
    const rows = await this.executor
      .select()
      .from(applicationAiContext)
      .where(eq(applicationAiContext.applicationId, applicationId))
      .limit(1);
    return (rows[0] as InterviewContextRow | undefined) ?? null;
  }
}

export function createInterviewReadPort(
  executor: DbExecutor,
): InterviewReadPort {
  return new InterviewReadPort(executor);
}

type TurnConflictDecision = {
  kind: "conflict";
  currentTurn: number;
  status: InterviewContextRow["status"] | "not_started";
};

type BootstrapAlreadyDoneDecision = {
  kind: "bootstrap_already_done";
  output: InterviewerOutput;
  canFinish: boolean;
};

type BootstrapPersistDecision = {
  kind: "bootstrap_persist";
  nextLog: InterviewLogEntry[];
  output: InterviewerOutput;
  canFinish: boolean;
};

type ForcedCompletionDecision = {
  kind: "forced_completion";
  nextLog: InterviewLogEntry[];
  output: InterviewerOutput;
  completedAt: string;
};

type AdvanceDecision = {
  kind: "advance";
  nextLog: InterviewLogEntry[];
  nextTurn: number;
  output: InterviewerOutput;
  canFinish: boolean;
};

type CompleteDecision = {
  kind: "complete";
  completedAt: string;
};

type AlreadyCompleteDecision = {
  kind: "already_complete";
};

type MissingTopicsDecision = {
  kind: "missing_topics";
  missing: CoreTopic[];
};

type TurnDecision =
  | TurnConflictDecision
  | BootstrapAlreadyDoneDecision
  | BootstrapPersistDecision
  | ForcedCompletionDecision
  | AdvanceDecision
  | CompleteDecision
  | MissingTopicsDecision;

type EngineNextInput =
  | { kind: "bootstrap"; llmOutput: InterviewerOutput }
  | {
      kind: "advance";
      expectedCurrentTurn: number;
      userMessage: string;
      llmOutput: InterviewerOutput;
      baseMessages: EngineMessage[];
    }
  | {
      kind: "forced_completion";
      expectedCurrentTurn: number;
      userMessage: string;
      nowIso: string;
    };

function buildBootstrapMessages(): EngineMessage[] {
  return [
    {
      role: "user",
      content:
        "Start the interview. Greet the admin briefly and ask the first question covering one of the core topics.",
    },
  ];
}

type TurnContext = {
  log: InterviewLogEntry[];
  nextTurnNumber: number;
  allTopicsCovered: boolean;
  pushbackTopics: string[];
};

type PhaseRule = {
  applies: (ctx: TurnContext) => boolean;
  message: (ctx: TurnContext) => string;
};

// Declarative phase rules — each rule contributes at most one system message
// per turn, in declaration order. Adding a phase = adding a row here.
const PHASE_RULES: PhaseRule[] = [
  {
    applies: () => true,
    message: ({ nextTurnNumber }) => {
      const remainingAfter = Math.max(0, MAX_TURNS - nextTurnNumber);
      return `Turn budget: this will be question ${nextTurnNumber} of ${MAX_TURNS}. Remaining after this one: ${remainingAfter}. Pace your follow-ups so every core topic is covered before the cap.`;
    },
  },
  {
    applies: ({ nextTurnNumber, allTopicsCovered }) =>
      allTopicsCovered &&
      nextTurnNumber >= SOFT_FINISH_WINDOW_MIN &&
      nextTurnNumber <= SOFT_FINISH_WINDOW_MAX,
    message: ({ nextTurnNumber }) =>
      `All six core topics are already covered and this is turn ${nextTurnNumber} of ${MAX_TURNS} (inside the 8–12 finish window). It is acceptable to set intent='suggest_finish' for this turn if you have nothing essential left to ask.`,
  },
  {
    applies: ({ allTopicsCovered, nextTurnNumber }) =>
      allTopicsCovered && nextTurnNumber > SOFT_FINISH_WINDOW_MIN,
    message: () => DISCOVERY_PHASE_SYSTEM_MESSAGE,
  },
  {
    applies: ({ nextTurnNumber }) => nextTurnNumber === MAX_TURNS,
    message: () =>
      `This is the FINAL question (turn ${MAX_TURNS} of ${MAX_TURNS}). You must set intent='final_question' and frame your message as the last one. Cover any remaining core topic in a single concluding question.`,
  },
  {
    applies: ({ pushbackTopics }) => pushbackTopics.length > 0,
    message: ({ pushbackTopics }) =>
      `Prior push-back markers exist for topics: ${pushbackTopics.join(", ")}. If the admin's next attempt on any of these topics is still imperfect, set guardrailAction='accept_garbage' and move on so the admin is never blocked.`,
  },
];

function collectPushbackTopics(log: InterviewLogEntry[]): string[] {
  const out = new Set<string>();
  for (const entry of log) {
    if (entry.role !== "user") continue;
    for (const topic of entry.garbagePushbackTopics ?? []) out.add(topic);
  }
  return [...out];
}

function buildAdvanceMessages(
  log: InterviewLogEntry[],
  userMessage: string,
  currentTurn: number,
): EngineMessage[] {
  const history: EngineMessage[] = log.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));

  const ctx: TurnContext = {
    log,
    nextTurnNumber: currentTurn + 1,
    allTopicsCovered: coverageOfLog(log).size === CORE_TOPICS.length,
    pushbackTopics: collectPushbackTopics(log),
  };

  const messages: EngineMessage[] = [...history];
  for (const rule of PHASE_RULES) {
    if (rule.applies(ctx)) {
      messages.push({ role: "system", content: rule.message(ctx) });
    }
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}

function shouldForceCompletion(row: InterviewContextRow): boolean {
  return row.currentTurn >= MAX_TURNS;
}

function decideNext(
  state: InterviewContextRow | null,
  input: EngineNextInput,
): TurnDecision {
  if (input.kind === "bootstrap") {
    if (!state) {
      return { kind: "conflict", currentTurn: 0, status: "not_started" };
    }
    if (state.currentTurn !== 0 || state.interviewLog.length > 0) {
      const covered = coverageOfLog(state.interviewLog);
      return {
        kind: "bootstrap_already_done",
        output: {
          assistantMessage: state.interviewLog[0]?.content ?? "",
          intent: "ask",
          topicsCoveredThisTurn: [],
          guardrailAction: "none",
          extraContextRelevance: null,
          followUpQuestion: null,
        },
        canFinish: missingTopics(covered).length === 0,
      };
    }
    const nextLog: InterviewLogEntry[] = [
      {
        role: "assistant",
        content: input.llmOutput.assistantMessage,
        topicsCoveredThisTurn: input.llmOutput.topicsCoveredThisTurn,
      },
    ];
    const covered = coverageOfLog(nextLog);
    return {
      kind: "bootstrap_persist",
      nextLog,
      output: input.llmOutput,
      canFinish: missingTopics(covered).length === 0,
    };
  }

  if (input.kind === "forced_completion") {
    if (!state) {
      return { kind: "conflict", currentTurn: 0, status: "not_started" };
    }
    if (
      state.status !== "in_progress" ||
      state.currentTurn !== input.expectedCurrentTurn
    ) {
      return {
        kind: "conflict",
        currentTurn: state.currentTurn,
        status: state.status,
      };
    }
    const userEntry: InterviewLogEntry = {
      role: "user",
      content: input.userMessage,
    };
    return {
      kind: "forced_completion",
      nextLog: [...state.interviewLog, userEntry],
      output: {
        assistantMessage: "",
        intent: "final_question",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
        extraContextRelevance: null,
        followUpQuestion: null,
      },
      completedAt: input.nowIso,
    };
  }

  if (!state) {
    return { kind: "conflict", currentTurn: 0, status: "not_started" };
  }
  if (
    state.status !== "in_progress" ||
    state.currentTurn !== input.expectedCurrentTurn
  ) {
    return {
      kind: "conflict",
      currentTurn: state.currentTurn,
      status: state.status,
    };
  }

  if (shouldForceCompletion(state)) {
    return {
      kind: "conflict",
      currentTurn: state.currentTurn,
      status: state.status,
    };
  }

  let sanitized = input.llmOutput;
  const guardRail = GUARD_RAIL_RULES[sanitized.guardrailAction];
  const isFinalQuestionTurn = state.currentTurn + 1 === MAX_TURNS;

  const userEntryForCoverage: InterviewLogEntry = {
    role: "user",
    content: input.userMessage,
  };
  const coveredAfterUserReply = coverageAfterAdminReply(
    state.interviewLog,
    input.userMessage,
  );
  if (isFinalQuestionTurn && !guardRail.suppressFinishReprompt) {
    sanitized = { ...sanitized, intent: "final_question" };
  }

  const userEntry: InterviewLogEntry = userEntryForCoverage;
  if (guardRail.persistMarker === "garbage_pushback") {
    userEntry.garbagePushbackTopics = sanitized.topicsCoveredThisTurn;
  }

  const assistantEntry: InterviewLogEntry = {
    role: "assistant",
    content: sanitized.assistantMessage,
    topicsCoveredThisTurn: sanitized.topicsCoveredThisTurn,
  };
  if (sanitized.intent === "final_question") {
    assistantEntry.intent = "final_question";
  } else if (sanitized.intent === "suggest_finish") {
    assistantEntry.intent = "suggest_finish";
  }
  if (sanitized.extraContextRelevance != null) {
    assistantEntry.extraContextRelevance = sanitized.extraContextRelevance;
  }
  if (sanitized.followUpQuestion != null) {
    assistantEntry.followUpQuestion = sanitized.followUpQuestion;
  }

  const nextLog: InterviewLogEntry[] = [
    ...state.interviewLog,
    userEntry,
    assistantEntry,
  ];

  const nextTurn = guardRail.advanceTurn
    ? state.currentTurn + 1
    : state.currentTurn;

  const canFinish =
    sanitized.intent === "suggest_finish" ||
    missingTopics(coveredAfterUserReply).length === 0;
  return {
    kind: "advance",
    nextLog,
    nextTurn,
    output: sanitized,
    canFinish,
  };
}

function decideComplete(
  state: InterviewContextRow | null,
  input: { expectedCurrentTurn: number; nowIso: string },
):
  | TurnConflictDecision
  | MissingTopicsDecision
  | CompleteDecision
  | AlreadyCompleteDecision {
  if (!state) {
    return { kind: "conflict", currentTurn: 0, status: "not_started" };
  }
  if (state.status === "completed") {
    return { kind: "already_complete" };
  }
  if (state.currentTurn !== input.expectedCurrentTurn) {
    return {
      kind: "conflict",
      currentTurn: state.currentTurn,
      status: state.status,
    };
  }
  const lastAssistant = [...state.interviewLog]
    .reverse()
    .find((entry) => entry.role === "assistant");
  if (lastAssistant?.intent === "suggest_finish") {
    return { kind: "complete", completedAt: input.nowIso };
  }

  const covered = coverageOfLog(state.interviewLog);
  const missing = missingTopics(covered);
  if (missing.length > 0) {
    return { kind: "missing_topics", missing };
  }
  return { kind: "complete", completedAt: input.nowIso };
}

function sanitizeOutput(o: InterviewerOutput): InterviewerOutput {
  return { ...o, assistantMessage: sanitizeAiMarkdown(o.assistantMessage) };
}

async function callInterviewerLlm(
  provider: AIProviderPort,
  messages: EngineMessage[],
) {
  return provider.generateObject({
    systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
    messages,
    model: INTERVIEW_MODEL,
    schema: interviewerOutputSchema,
  });
}

async function loadOrInit(
  executor: DbExecutor,
  applicationId: string,
): Promise<InterviewContextRow> {
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

async function writeBootstrap(
  executor: DbExecutor,
  rowId: string,
  nextLog: InterviewLogEntry[],
): Promise<InterviewContextRow> {
  const [updated] = await executor
    .update(applicationAiContext)
    .set({ interviewLog: nextLog })
    .where(eq(applicationAiContext.id, rowId))
    .returning();
  return updated as InterviewContextRow;
}

async function writeAdvance(
  executor: DbExecutor,
  rowId: string,
  nextLog: InterviewLogEntry[],
  nextTurn: number,
): Promise<InterviewContextRow> {
  const [updated] = await executor
    .update(applicationAiContext)
    .set({ interviewLog: nextLog, currentTurn: nextTurn })
    .where(eq(applicationAiContext.id, rowId))
    .returning();
  return updated as InterviewContextRow;
}

async function writeForcedCompletion(
  executor: DbExecutor,
  rowId: string,
  userId: string,
  nextLog: InterviewLogEntry[],
  completedAt: string,
): Promise<InterviewContextRow> {
  const [updated] = await executor
    .update(applicationAiContext)
    .set({
      interviewLog: nextLog,
      status: "completed",
      summaryStatus: "pending",
      completedBy: userId,
      completedAt,
    })
    .where(eq(applicationAiContext.id, rowId))
    .returning();
  return updated as InterviewContextRow;
}

async function writeMarkCompleted(
  executor: DbExecutor,
  rowId: string,
  userId: string,
  completedAt: string,
): Promise<InterviewContextRow> {
  const [updated] = await executor
    .update(applicationAiContext)
    .set({
      status: "completed",
      summaryStatus: "pending",
      completedBy: userId,
      completedAt,
    })
    .where(eq(applicationAiContext.id, rowId))
    .returning();
  return updated as InterviewContextRow;
}

export async function getInterviewContext(
  applicationId: string,
): Promise<InterviewContextRow | null> {
  return createInterviewReadPort(db).loadByApplicationId(applicationId);
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
    const trimmedMessage = message.trim();
    const isBootstrap = expectedCurrentTurn === 0 && trimmedMessage === "";
    const row = await loadOrInit(tx, applicationId);

    if (!isBootstrap) {
      if (
        row.status !== "in_progress" ||
        row.currentTurn !== expectedCurrentTurn
      ) {
        throw new TurnConflictError(row.currentTurn, row.status);
      }
      if (shouldForceCompletion(row)) {
        return runForcedCompletionTurn(tx, row, {
          tenantId,
          userId,
          message: trimmedMessage,
          expectedCurrentTurn,
        });
      }
    }

    return runLlmTurn(tx, provider, row, isBootstrap, {
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

async function runForcedCompletionTurn(
  tx: DbExecutor,
  row: InterviewContextRow,
  params: LlmTurnParams,
): Promise<TurnResult> {
  const decision = decideNext(row, {
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

  const updated = await writeForcedCompletion(
    tx,
    row.id,
    params.userId,
    decision.nextLog,
    decision.completedAt,
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

  return { row: updated, output: decision.output, canFinish: true };
}

async function runLlmTurn(
  tx: DbExecutor,
  provider: AIProviderPort,
  row: InterviewContextRow,
  isBootstrap: boolean,
  params: LlmTurnParams,
): Promise<TurnResult> {
  const baseMessages = isBootstrap
    ? buildBootstrapMessages()
    : buildAdvanceMessages(row.interviewLog, params.message, row.currentTurn);

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
        ? decideNext(row, { kind: "bootstrap", llmOutput: sanitizedFirst })
        : decideNext(row, {
            kind: "advance",
            expectedCurrentTurn: params.expectedCurrentTurn,
            userMessage: params.message,
            llmOutput: sanitizedFirst,
            baseMessages,
          });

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
    return { row, output: decision.output, canFinish: decision.canFinish };
  }

  if (decision.kind === "bootstrap_persist") {
    const updated = await writeBootstrap(tx, row.id, decision.nextLog);
    return {
      row: updated,
      output: decision.output,
      canFinish: decision.canFinish,
    };
  }

  if (decision.kind === "advance") {
    const updated = await writeAdvance(
      tx,
      row.id,
      decision.nextLog,
      decision.nextTurn,
    );
    return {
      row: updated,
      output: decision.output,
      canFinish: decision.canFinish,
    };
  }

  throw new Error(`unexpected turn decision: ${decision.kind}`);
}

export async function runInterviewComplete(
  params: RunCompleteParams,
): Promise<{ row: InterviewContextRow }> {
  return db.transaction(async (tx) => {
    const port = createInterviewReadPort(tx);
    const row = await port.loadByApplicationId(params.applicationId);

    const decision = decideComplete(row, {
      expectedCurrentTurn: params.expectedCurrentTurn,
      nowIso: new Date().toISOString(),
    });

    if (decision.kind === "conflict") {
      throw new TurnConflictError(decision.currentTurn, decision.status);
    }
    if (decision.kind === "missing_topics") {
      throw new MissingTopicsError(decision.missing);
    }
    if (decision.kind === "already_complete") {
      return { row: row as InterviewContextRow };
    }

    const updated = await writeMarkCompleted(
      tx,
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
  const port = createInterviewReadPort(db);
  const row = await port.loadByApplicationId(params.applicationId);
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
    await persistSummaryFailed(db, row.id);
    throw new SummaryGenerationFailedError(
      error instanceof Error ? error.message : "Summary generation failed",
      { cause: error },
    );
  }

  return db.transaction(async (tx) => {
    const updated = await persistSummaryReady(tx, row.id, summary);
    await tx
      .update(applications)
      .set({ aiEnabled: true })
      .where(eq(applications.id, params.applicationId));
    return { row: updated };
  });
}
