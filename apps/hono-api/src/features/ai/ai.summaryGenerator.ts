import { AIEmptyResponseError, AIProviderError } from "./ai.errors.js";
import type { InterviewLogEntry } from "./ai.interview.schema.js";
import { INTERVIEW_MODEL } from "./ai.prompts.interview.js";
import type { AIProvider } from "./ai.provider.js";
import { sanitizeAiMarkdown } from "./ai.sanitize.js";

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

export type GenerateInterviewSummaryParams = {
  applicationName: string;
  interviewLog: InterviewLogEntry[];
  abortSignal?: AbortSignal;
};

function formatInterviewLog(log: InterviewLogEntry[]): string {
  return log
    .map((entry, i) => {
      const speaker = entry.role === "assistant" ? "Interviewer" : "Admin";
      return `Turn ${i + 1} — ${speaker}:\n${entry.content}`;
    })
    .join("\n\n");
}

function buildUserMessage(
  applicationName: string,
  log: InterviewLogEntry[],
): string {
  return `Application name: ${applicationName}

Interview transcript:

${formatInterviewLog(log)}

Produce the application context markdown summary now, following the structure in the system instructions.`;
}

export async function generateInterviewSummary(
  provider: AIProvider,
  params: GenerateInterviewSummaryParams,
): Promise<string> {
  const userMessage = buildUserMessage(
    params.applicationName,
    params.interviewLog,
  );

  const response = await provider.generateText({
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    model: INTERVIEW_MODEL,
    abortSignal: params.abortSignal,
  });

  const raw = response.text ?? "";
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
