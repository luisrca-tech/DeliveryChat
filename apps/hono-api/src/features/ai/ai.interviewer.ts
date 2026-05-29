import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { applicationAiContext } from "../../db/schema/applicationAiContext.js";
import { aiUsageLog } from "../../db/schema/aiUsageLog.js";
import { env } from "../../env.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";
import type { AIProvider, AIProviderMessage } from "./ai.provider.js";

export const CORE_TOPICS = [
  "business_description",
  "target_audience",
  "products_services",
  "preferred_tone",
  "common_support_scenarios",
  "prohibited_topics",
] as const;

export type CoreTopic = (typeof CORE_TOPICS)[number];

export const interviewerOutputSchema = z.object({
  assistantMessage: z.string().min(1),
  intent: z.enum(["ask", "suggest_finish", "final_question"]),
  topicsCoveredThisTurn: z.array(z.string()).default([]),
  guardrailAction: z.enum([
    "none",
    "redirect_scope",
    "block_extraction",
    "pushback_garbage",
    "accept_garbage",
  ]),
});

export type InterviewerOutput = z.infer<typeof interviewerOutputSchema>;

export type InterviewLogEntry = {
  role: "assistant" | "user";
  content: string;
  topicsCoveredThisTurn?: string[];
};

const CORE_TOPIC_SET = new Set<string>(CORE_TOPICS);

export function computeCoveredTopics(
  log: InterviewLogEntry[],
): Set<CoreTopic> {
  const covered = new Set<CoreTopic>();
  for (const entry of log) {
    if (entry.role !== "assistant") continue;
    const topics = entry.topicsCoveredThisTurn ?? [];
    for (const topic of topics) {
      if (CORE_TOPIC_SET.has(topic)) {
        covered.add(topic as CoreTopic);
      } else {
        console.warn("[ai.interviewer] ignoring unknown topic key:", topic);
      }
    }
  }
  return covered;
}

function missingTopics(covered: Set<CoreTopic>): CoreTopic[] {
  return CORE_TOPICS.filter((t) => !covered.has(t));
}

export type InterviewContextRow = {
  id: string;
  applicationId: string;
  status: "in_progress" | "completed";
  interviewLog: InterviewLogEntry[];
  currentTurn: number;
  contextSummary: string | null;
  completedBy: string | null;
  completedAt: string | null;
};

export const INTERVIEW_MODEL = env.AI_INTERVIEW_MODEL;

export const INTERVIEWER_SYSTEM_PROMPT = `You are the DeliveryChat AI Interviewer.

Your job: collect the business context that the support AI assistant will need to answer
end-user questions for this application. Conduct a short, focused interview with the
admin who is configuring the assistant.

Core topics you must eventually cover (server tracks coverage):
- business_description
- target_audience
- products_services
- preferred_tone
- common_support_scenarios
- prohibited_topics

Always reply with structured output matching the contract:
- assistantMessage: the message to show the admin (markdown allowed, concise)
- intent: 'ask' (default) | 'suggest_finish' | 'final_question'
- topicsCoveredThisTurn: keys from the core topics list addressed in this turn
- guardrailAction: 'none' by default

Keep questions one-at-a-time, conversational, and tailored to the admin's last answer.`;

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

type RunBootstrapTurnResult = {
  row: InterviewContextRow;
  output: InterviewerOutput;
  canFinish: boolean;
};

export class MissingTopicsError extends Error {
  readonly missing: CoreTopic[];
  readonly code = "interview_checklist_incomplete";

  constructor(missing: CoreTopic[]) {
    super(`interview_checklist_incomplete: missing=${missing.join(",")}`);
    this.name = "MissingTopicsError";
    this.missing = missing;
  }
}

export class TurnConflictError extends Error {
  readonly currentTurn: number;
  readonly status: InterviewContextRow["status"] | "not_started";

  constructor(
    currentTurn: number,
    status: InterviewContextRow["status"] | "not_started",
  ) {
    super(`turn_conflict: current=${currentTurn} status=${status}`);
    this.name = "TurnConflictError";
    this.currentTurn = currentTurn;
    this.status = status;
  }
}

type RunAdvanceTurnParams = {
  provider: AIProvider;
  applicationId: string;
  tenantId: string;
  userId: string;
  userMessage: string;
  expectedCurrentTurn: number;
};

export async function runBootstrapTurn(
  params: RunBootstrapTurnParams,
): Promise<RunBootstrapTurnResult> {
  const { provider, applicationId, tenantId, userId } = params;
  const startTime = Date.now();

  const result = await db.transaction(async (tx) => {
    const row = await findOrCreateInterviewContext(applicationId, {
      tx: tx as unknown as typeof db,
    });

    if (row.currentTurn !== 0 || row.interviewLog.length > 0) {
      return { row, output: null as InterviewerOutput | null, alreadyBootstrapped: true };
    }

    const messages: AIProviderMessage[] = [
      {
        role: "user",
        content:
          "Start the interview. Greet the admin briefly and ask the first question covering one of the core topics.",
      },
    ];

    const llm = await provider.generateObject({
      systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
      messages,
      model: INTERVIEW_MODEL,
      schema: interviewerOutputSchema,
    });

    const sanitized: InterviewerOutput = {
      ...llm.object,
      assistantMessage: sanitizeAiMarkdown(llm.object.assistantMessage),
    };

    const nextLog: InterviewLogEntry[] = [
      {
        role: "assistant",
        content: sanitized.assistantMessage,
        topicsCoveredThisTurn: sanitized.topicsCoveredThisTurn,
      },
    ];

    const [updated] = await tx
      .update(applicationAiContext)
      .set({ interviewLog: nextLog })
      .where(eq(applicationAiContext.id, row.id))
      .returning();

    await tx.insert(aiUsageLog).values({
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
      output: sanitized,
      alreadyBootstrapped: false,
    };
  });

  if (result.alreadyBootstrapped) {
    const covered = computeCoveredTopics(result.row.interviewLog);
    return {
      row: result.row,
      output: {
        assistantMessage: result.row.interviewLog[0]?.content ?? "",
        intent: "ask",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      },
      canFinish: missingTopics(covered).length === 0,
    };
  }

  const covered = computeCoveredTopics(result.row.interviewLog);
  return {
    row: result.row,
    output: result.output!,
    canFinish: missingTopics(covered).length === 0,
  };
}

export async function runAdvanceTurn(
  params: RunAdvanceTurnParams,
): Promise<RunBootstrapTurnResult> {
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
    const row = rows[0] as InterviewContextRow | undefined;

    if (!row) {
      throw new TurnConflictError(0, "not_started");
    }
    if (row.status !== "in_progress" || row.currentTurn !== expectedCurrentTurn) {
      throw new TurnConflictError(row.currentTurn, row.status);
    }

    const history: AIProviderMessage[] = row.interviewLog.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));
    const messages: AIProviderMessage[] = [
      ...history,
      { role: "user", content: userMessage },
    ];

    const llm = await provider.generateObject({
      systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
      messages,
      model: INTERVIEW_MODEL,
      schema: interviewerOutputSchema,
    });

    let sanitized: InterviewerOutput = {
      ...llm.object,
      assistantMessage: sanitizeAiMarkdown(llm.object.assistantMessage),
    };

    let totalPromptTokens = llm.usage.promptTokens;
    let totalCompletionTokens = llm.usage.completionTokens;
    let finalFinishReason = llm.finishReason;

    if (sanitized.intent === "suggest_finish") {
      const projectedCovered = computeCoveredTopics([
        ...row.interviewLog,
        {
          role: "assistant",
          content: sanitized.assistantMessage,
          topicsCoveredThisTurn: sanitized.topicsCoveredThisTurn,
        },
      ]);
      const missing = missingTopics(projectedCovered);

      if (missing.length > 0) {
        const reprompt: AIProviderMessage[] = [
          ...messages,
          {
            role: "user",
            content: `You suggested finishing, but the following core topics are still uncovered: ${missing.join(", ")}. Do not suggest finishing yet. Ask the admin a focused question that covers one of the missing topics.`,
          },
        ];
        const retry = await provider.generateObject({
          systemPrompt: INTERVIEWER_SYSTEM_PROMPT,
          messages: reprompt,
          model: INTERVIEW_MODEL,
          schema: interviewerOutputSchema,
        });

        sanitized = {
          ...retry.object,
          intent: "ask",
          assistantMessage: sanitizeAiMarkdown(retry.object.assistantMessage),
        };
        totalPromptTokens += retry.usage.promptTokens;
        totalCompletionTokens += retry.usage.completionTokens;
        finalFinishReason = retry.finishReason;
      }
    }

    const nextLog: InterviewLogEntry[] = [
      ...row.interviewLog,
      { role: "user", content: userMessage },
      {
        role: "assistant",
        content: sanitized.assistantMessage,
        topicsCoveredThisTurn: sanitized.topicsCoveredThisTurn,
      },
    ];

    const [updated] = await txd
      .update(applicationAiContext)
      .set({ interviewLog: nextLog, currentTurn: row.currentTurn + 1 })
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

    const updatedRow = updated as InterviewContextRow;
    const finalCovered = computeCoveredTopics(updatedRow.interviewLog);
    return {
      row: updatedRow,
      output: sanitized,
      canFinish: missingTopics(finalCovered).length === 0,
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
    const row = rows[0] as InterviewContextRow | undefined;

    if (!row) {
      throw new TurnConflictError(0, "not_started");
    }
    if (row.status !== "in_progress" || row.currentTurn !== expectedCurrentTurn) {
      throw new TurnConflictError(row.currentTurn, row.status);
    }

    const covered = computeCoveredTopics(row.interviewLog);
    const missing = missingTopics(covered);
    if (missing.length > 0) {
      throw new MissingTopicsError(missing);
    }

    const completedAt = new Date().toISOString();
    const [updated] = await txd
      .update(applicationAiContext)
      .set({
        status: "completed",
        completedBy: userId,
        completedAt,
      })
      .where(eq(applicationAiContext.id, row.id))
      .returning();

    return { row: updated as InterviewContextRow };
  });
}
