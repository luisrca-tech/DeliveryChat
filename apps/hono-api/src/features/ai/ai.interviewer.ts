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
};

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
      { role: "assistant", content: sanitized.assistantMessage },
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
    return {
      row: result.row,
      output: {
        assistantMessage:
          result.row.interviewLog[0]?.content ?? "",
        intent: "ask",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      },
    };
  }

  return { row: result.row, output: result.output! };
}
