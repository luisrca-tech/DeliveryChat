import { serializeLexicalToPlainText } from "@repo/lexical-utils";
import { env } from "../../env.js";
import { createAIProvider } from "../ai/ai.groqProvider.js";
import { runAICall } from "../ai/ai.callOrchestrator.js";
import { buildAutonomousSystemPrompt } from "../ai/ai.context.js";
import { checkAiQuota } from "../ai/ai.quota.js";
import { sanitizeAiMarkdown } from "../ai/ai.sanitize.js";
import type {
  AIProviderMessage,
  AIProviderToolsResponse,
} from "../ai/ai.providerPort.js";
import {
  broadcastRoomEvent,
  buildTypingStartEvent,
  buildTypingStopEvent,
} from "../chat/broadcasting.service.js";
import { sendMessage } from "../chat/chat.service.js";
import { isAiTurnEntitled } from "./entitlement.js";
import { isHumanRequest } from "./humanRequest.js";
import { escalateConversation } from "./escalate.js";
import { tryAcquireTurnLock, releaseTurnLock } from "./lock.js";
import { assembleTools, ESCALATE_TOOL_NAME } from "./tools.js";
import type { TurnEscalationContext } from "./tools.js";
import {
  loadContextSummary,
  loadConversationMessages,
  loadDataToolset,
  loadTurnContext,
  type TurnConversation,
  type TurnContext,
  type TurnMessage,
} from "./loadContext.js";

/** Upper bound on model+tool round-trips per turn. */
export const AI_TURN_MAX_STEPS = 5;

/**
 * Synthetic identity used when broadcasting the AI's typing indicator. The WS
 * protocol requires a `userId`; this sentinel keeps the payload backward
 * compatible while letting the widget distinguish AI typing later.
 */
export const AI_TYPING_USER_ID = "ai-assistant";
const AI_TYPING_USER_NAME = "AI Assistant";
const AI_SENDER_NAME = "AI Assistant";

function toPlainText(message: TurnMessage): string {
  return serializeLexicalToPlainText(
    message.content,
    (message.contentFormat ?? "plain") as "plain" | "lexical",
  );
}

/**
 * Map the conversation transcript to provider messages. Visitor turns become
 * `user`; AI/operator turns become `assistant`; system messages are dropped.
 */
function buildTurnMessages(messages: TurnMessage[]): AIProviderMessage[] {
  const result: AIProviderMessage[] = [];
  for (const m of messages) {
    if (m.authorType === "system") continue;
    result.push({
      role: m.authorType === "visitor" ? "user" : "assistant",
      content: toPlainText(m),
    });
  }
  return result;
}

function startAiTyping(conversation: TurnConversation): void {
  try {
    broadcastRoomEvent(
      conversation.id,
      buildTypingStartEvent({
        conversationId: conversation.id,
        userId: AI_TYPING_USER_ID,
        userName: AI_TYPING_USER_NAME,
        senderRole: "operator",
      }),
    );
  } catch (err) {
    console.error("[ai-turn] typing:start broadcast failed", conversation.id, err);
  }
}

function stopAiTyping(conversation: TurnConversation): void {
  try {
    broadcastRoomEvent(
      conversation.id,
      buildTypingStopEvent({
        conversationId: conversation.id,
        userId: AI_TYPING_USER_ID,
      }),
    );
  } catch (err) {
    console.error("[ai-turn] typing:stop broadcast failed", conversation.id, err);
  }
}

/**
 * Run one autonomous AI turn for a conversation. Safe to fire-and-forget: it
 * owns a per-conversation lock, its own error handling, and the escalation
 * policy. It NEVER throws and NEVER leaves the visitor with dead air — any
 * failure ends in an escalation to a human.
 *
 * This is the single seam that becomes the BullMQ job handler later.
 */
export async function runAiTurn(conversationId: string): Promise<void> {
  if (!tryAcquireTurnLock(conversationId)) {
    return;
  }

  let ctx: TurnContext | null = null;
  let typingStarted = false;

  try {
    ctx = await loadTurnContext(conversationId);
    if (!ctx) return;

    const { conversation, organization, application } = ctx;

    // ── Bail silently unless this is a live, AI-handled, unassigned turn ──
    if (
      conversation.handledBy !== "ai" ||
      conversation.assignedTo !== null ||
      conversation.status === "closed"
    ) {
      console.debug("[ai-turn] skipped: not an AI-handled live turn", conversationId);
      return;
    }
    if (!isAiTurnEntitled({ organization, application })) {
      console.debug("[ai-turn] skipped: org/application not entitled", conversationId);
      return;
    }

    // ── Quota gate → graceful escalation ──
    const quota = await checkAiQuota(organization.id, organization.plan);
    if (!quota.allowed) {
      await escalateConversation({
        conversation,
        reason: "quota_exhausted",
        kind: "quota_exhausted",
      });
      return;
    }

    const turnMessages = await loadConversationMessages(
      conversationId,
      env.AI_CONTEXT_MESSAGE_LIMIT,
    );

    // ── Deterministic pre-LLM human-request escalation (skips the model) ──
    const latestVisitor = [...turnMessages]
      .reverse()
      .find((m) => m.authorType === "visitor");
    if (latestVisitor && isHumanRequest(toPlainText(latestVisitor))) {
      await escalateConversation({
        conversation,
        reason: "human_requested",
        kind: "human_requested",
      });
      return;
    }

    startAiTyping(conversation);
    typingStarted = true;

    // ── Assemble tools (escalate + permitted data tools) ──
    const turnCtx: TurnEscalationContext = { escalation: null };
    const toolset = await loadDataToolset(application.id);
    // Both HTTP and SQL tools share the org add-on entitlement (already
    // verified above via `isAiTurnEntitled`). SQL additionally requires the
    // per-application `aiDbEnabled` opt-in.
    const tools = assembleTools({
      applicationId: application.id,
      toolset,
      httpAllowed: true, // org entitlement already verified above
      sqlAllowed: application.aiDbEnabled,
      turnCtx,
    });

    const contextSummary = await loadContextSummary(application.id);
    const systemPrompt = buildAutonomousSystemPrompt({
      tenantName: organization.name,
      contextSummary,
      toolNames: Object.keys(tools).filter((n) => n !== ESCALATE_TOOL_NAME),
    });

    const provider = createAIProvider(env.AI_MODEL, env.GROQ_API_KEY);
    const providerMessages = buildTurnMessages(turnMessages);
    const usageUserId =
      conversation.createdBy ?? latestVisitor?.senderId ?? organization.id;

    // ── Run the tool loop through the shared orchestrator (usage logged) ──
    let result: AIProviderToolsResponse;
    try {
      result = await runAICall<AIProviderToolsResponse, AIProviderToolsResponse>({
        action: "autonomous_reply",
        tenantId: organization.id,
        userId: usageUserId,
        conversationId,
        model: env.AI_MODEL,
        providerCall: async () => {
          const r = await provider.generateWithTools({
            systemPrompt,
            messages: providerMessages,
            model: env.AI_MODEL,
            tools,
            maxSteps: AI_TURN_MAX_STEPS,
          });
          return {
            result: r,
            inputTokens: r.usage.promptTokens,
            outputTokens: r.usage.completionTokens,
            finishReason: r.finishReason,
          };
        },
        parse: (raw) => raw,
      });
    } catch (err) {
      console.error("[ai-turn] provider call failed", conversationId, err);
      await escalateConversation({
        conversation,
        reason: "turn_failed",
        kind: "turn_failed",
      });
      return;
    }

    // ── Outcomes ──
    if (turnCtx.escalation) {
      await escalateConversation({
        conversation,
        reason: turnCtx.escalation.reason,
        kind: "knowledge_gap",
      });
      return;
    }

    const text = (result.text ?? "").trim();
    if (text === "") {
      await escalateConversation({
        conversation,
        reason: "no_answer",
        kind: "knowledge_gap",
      });
      return;
    }

    await sendMessage({
      conversationId,
      senderId: null,
      authorType: "ai",
      content: sanitizeAiMarkdown(text),
      contentFormat: "plain",
      broadcastContext: { senderName: AI_SENDER_NAME, senderRole: "operator" },
    });
  } catch (err) {
    // Fail-safe: any unexpected throw escalates rather than leaving dead air.
    console.error("[ai-turn] unexpected turn failure", conversationId, err);
    if (ctx) {
      try {
        await escalateConversation({
          conversation: ctx.conversation,
          reason: "turn_failed",
          kind: "turn_failed",
        });
      } catch (escErr) {
        console.error(
          "[ai-turn] escalation ALSO failed — visitor left without handoff",
          conversationId,
          escErr,
        );
      }
    }
  } finally {
    if (typingStarted && ctx) {
      stopAiTyping(ctx.conversation);
    }
    releaseTurnLock(conversationId);
  }
}
