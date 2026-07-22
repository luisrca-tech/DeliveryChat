import { eq } from "drizzle-orm";
import { serializeLexicalToPlainText } from "@repo/lexical-utils";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { env } from "../../env.js";
import { runAICall } from "../ai/ai.callOrchestrator.js";
import { createAIProvider } from "../ai/ai.openRouterProvider.js";
import { AIEmptyResponseError } from "../ai/ai.errors.js";
import {
  loadConversationMessages,
  type TurnConversation,
  type TurnMessage,
} from "./loadContext.js";

/** Upper bound on the persisted handoff summary length. */
export const HANDOFF_SUMMARY_MAX_CHARS = 2000;

export const HANDOFF_SUMMARY_SYSTEM_PROMPT = `You are the DeliveryChat Handoff Summarizer.

An AI assistant has just handed a live support conversation to a human operator.
Write a SHORT briefing (plain text, no markdown headings, at most 6 sentences)
that lets the operator take over instantly. Cover:
- What the visitor wants / their main question.
- Any facts already established or answers already given.
- Why the AI escalated (missing data, out of scope, or the visitor asked for a human).
- The single most useful next action for the operator.

Never invent details that are not in the transcript. Be concise and factual.`;

function transcriptLine(m: TurnMessage): string {
  const speaker =
    m.authorType === "visitor"
      ? "Visitor"
      : m.authorType === "ai"
        ? "AI"
        : m.authorType === "operator"
          ? "Operator"
          : "System";
  const text = serializeLexicalToPlainText(
    m.content,
    (m.contentFormat ?? "plain") as "plain" | "lexical",
  );
  return `${speaker}: ${text}`;
}

export function buildHandoffUserMessage(messages: TurnMessage[]): string {
  return `Conversation transcript so far:\n\n${messages
    .map(transcriptLine)
    .join("\n")}\n\nWrite the operator handoff briefing now.`;
}

function parseHandoffSummary(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AIEmptyResponseError("Handoff summarizer returned empty output");
  }
  return trimmed.slice(0, HANDOFF_SUMMARY_MAX_CHARS);
}

/**
 * Generate and persist a short AI briefing of the conversation for the operator
 * taking over after an escalation.
 *
 * Fire-and-forget and failure-tolerant BY DESIGN: escalation must NEVER fail
 * because the summary failed, so this function never throws — every error is
 * logged and swallowed. It is quota-excluded (`handoff_summary`) so it does not
 * consume the tenant's monthly AI allowance.
 */
export async function generateHandoffSummary(
  conversation: TurnConversation,
): Promise<void> {
  try {
    const messages = await loadConversationMessages(
      conversation.id,
      env.AI_CONTEXT_MESSAGE_LIMIT,
    );
    if (messages.length === 0) return;

    const provider = createAIProvider(env.AI_MODEL, env.OPENROUTER_API_KEY);
    const userMessage = buildHandoffUserMessage(messages);

    const summary = await runAICall<string, string>({
      action: "handoff_summary",
      tenantId: conversation.organizationId,
      userId: conversation.createdBy ?? conversation.organizationId,
      conversationId: conversation.id,
      model: env.AI_MODEL,
      providerCall: async () => {
        const response = await provider.generateText({
          systemPrompt: HANDOFF_SUMMARY_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
          model: env.AI_MODEL,
        });
        return {
          result: response.text ?? "",
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
          finishReason: response.finishReason,
        };
      },
      parse: parseHandoffSummary,
    });

    await db
      .update(conversations)
      .set({ handoffSummary: summary })
      .where(eq(conversations.id, conversation.id));
  } catch (err) {
    console.error(
      "[ai-turn] handoff summary generation failed (escalation unaffected)",
      conversation.id,
      err,
    );
  }
}
