import { eq } from "drizzle-orm";
import { db, type DbExecutor } from "../../db/index.js";
import { applicationAiContext } from "../../db/schema/applicationAiContext.js";
import { runAICall } from "./ai.callOrchestrator.js";
import { AIEmptyResponseError, AIProviderError } from "./ai.errors.js";
import type {
  InterviewContextRow,
  InterviewLogEntry,
} from "./ai.interview.schema.js";
import { INTERVIEW_MODEL } from "./ai.prompts.interview.js";
import type { AIProviderPort } from "./ai.providerPort.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";

// SUMMARY CONTRACT
// ----------------
// This module is the single owner of the contextSummary contract — the markdown
// string written to applicationAiContext.contextSummary and later injected into
// the support assistant's system prompt by ai.context.applicationContext().
//
// The contract has four pieces; all live in this file so a change to any one
// surfaces here:
//   1. Structure  — section headings and ordering, in SUMMARY_SYSTEM_PROMPT
//   2. Limits     — SUMMARY_MAX_CHARS upper bound on the rendered output
//   3. Sanitation — parseSummaryResponse (markdown allowlist + non-empty check)
//   4. Persistence — persistSummaryReady / persistSummaryFailed (summaryStatus transitions)
//
// Generation lifecycle (provider call + retries) is generateInterviewSummary.
// Call-site lifecycle (load row, decide, persist, flip aiEnabled) lives in
// ai.interview.stateMachine.runGenerateSummary.

export const SUMMARY_MAX_CHARS = 8000;

export const SUMMARY_SYSTEM_PROMPT = `You are the DeliveryChat AI Summary Generator.

Your job: convert a completed interview log into a structured markdown summary that the
support AI assistant will use as application context for every reply it drafts.

Output requirements:
- Plain GitHub-flavored markdown. No code fences, no HTML.
- Begin with the heading "# Application Context".
- Include exactly these six topical sections, each as an H2, in this order:
  ## Business
  ## Audience
  ## Products & Services
  ## Tone
  ## Common Scenarios
  ## Prohibited Topics
- After the six topical sections, add one final section:
  ## Drafting Guidance
  containing 2–4 imperative do/don't bullets synthesized from the interview.
- Be concise but information-dense. Prefer short paragraphs and bullet lists.
- Never invent facts that are not supported by the interview log. If a topic is thin,
  say so explicitly rather than fabricating detail.
- Do not include meta commentary about the interview process itself.`;

export type GenerateInterviewSummaryInput = {
  provider: AIProviderPort;
  tenantId: string;
  userId: string;
  applicationName: string;
  interviewLog: InterviewLogEntry[];
  abortSignal?: AbortSignal;
  tx?: DbExecutor;
};

function formatInterviewLog(log: InterviewLogEntry[]): string {
  return log
    .map((entry, i) => {
      const speaker = entry.role === "assistant" ? "Interviewer" : "Admin";
      return `Turn ${i + 1} — ${speaker}:\n${entry.content}`;
    })
    .join("\n\n");
}

export function buildSummaryUserMessage(
  applicationName: string,
  log: InterviewLogEntry[],
): string {
  return `Application name: ${applicationName}

Interview transcript:

${formatInterviewLog(log)}

Produce the application context markdown summary now, following the structure in the system instructions.`;
}

export function parseSummaryResponse(raw: string): string {
  if (raw.length > SUMMARY_MAX_CHARS) {
    throw new AIProviderError(
      `Summary output too large: ${raw.length} chars exceeds ${SUMMARY_MAX_CHARS}`,
    );
  }

  const sanitized = sanitizeAiMarkdown(raw);
  if (!sanitized) {
    throw new AIEmptyResponseError("Summary generator returned empty output");
  }
  return sanitized;
}

export async function persistSummaryReady(
  executor: DbExecutor,
  rowId: string,
  contextSummary: string,
): Promise<InterviewContextRow> {
  const [updated] = await executor
    .update(applicationAiContext)
    .set({ contextSummary, summaryStatus: "ready" })
    .where(eq(applicationAiContext.id, rowId))
    .returning();
  return updated as InterviewContextRow;
}

export async function persistSummaryFailed(
  executor: DbExecutor,
  rowId: string,
): Promise<void> {
  await executor
    .update(applicationAiContext)
    .set({ summaryStatus: "failed" })
    .where(eq(applicationAiContext.id, rowId));
}

export async function generateInterviewSummary(
  input: GenerateInterviewSummaryInput,
): Promise<string> {
  const userMessage = buildSummaryUserMessage(
    input.applicationName,
    input.interviewLog,
  );

  return runAICall<string, string>({
    action: "interview_summary",
    tenantId: input.tenantId,
    userId: input.userId,
    conversationId: null,
    model: INTERVIEW_MODEL,
    abortSignal: input.abortSignal,
    tx: input.tx ?? db,
    providerCall: async () => {
      const response = await input.provider.generateText({
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        model: INTERVIEW_MODEL,
        abortSignal: input.abortSignal,
      });
      return {
        result: response.text ?? "",
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        finishReason: response.finishReason,
      };
    },
    parse: parseSummaryResponse,
  });
}
