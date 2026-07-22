import { serializeLexicalToPlainText } from "@repo/lexical-utils";
import { env } from "../../env.js";
import { createAIProvider } from "../ai/ai.openRouterProvider.js";
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
  loadConversationLiveState,
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
 * Corrective instruction appended (as a user-role turn) when the model's first
 * draft was raw JSON. It steers the single turn-level retry toward prose the
 * visitor can actually read.
 */
const DEGENERATE_RETRY_PROMPT =
  "Your previous draft was raw JSON, which the visitor must never see. " +
  "Rewrite it as a short, natural-language answer (Markdown tables allowed) " +
  "using only facts already retrieved.";

/**
 * True when `text` reads as raw JSON rather than a natural-language answer — a
 * degenerate reply the visitor must never receive. It fires when:
 *   1. the trimmed text (or a ```json fence's contents) parses to a JSON object
 *      or array; OR
 *   2. it *looks* like JSON at the start (opens with `{`/`[` or a ```json
 *      fence) AND more than half of its characters sit inside `{...}`/`[...]`
 *      spans — catching malformed, concatenated tool-echo blobs that never
 *      parse cleanly.
 *
 * It deliberately passes normal prose, prose with a small inline code snippet,
 * and Markdown tables. Exported for direct unit testing.
 */
export function isDegenerateJsonReply(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;

  // Unwrap a ```json (or bare ```) fence, if present.
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const hasFence = fenceMatch !== null;
  const candidate = hasFence ? (fenceMatch[1] ?? "").trim() : trimmed;
  if (candidate === "") return false;

  // 1) Cleanly parses to an object/array → unambiguously JSON.
  try {
    const parsed = JSON.parse(candidate);
    if (parsed !== null && typeof parsed === "object") return true;
  } catch {
    // Not valid JSON — fall through to the structural heuristic.
  }

  // 2) Malformed/concatenated JSON: must look like JSON at the start and be
  //    mostly bracket content.
  const looksJsonStart =
    hasFence || candidate.startsWith("{") || candidate.startsWith("[");
  if (!looksJsonStart) return false;

  let depth = 0;
  let inside = 0;
  for (const ch of candidate) {
    if (ch === "{" || ch === "[") {
      depth++;
      inside++;
    } else if (ch === "}" || ch === "]") {
      if (depth > 0) inside++;
      depth = Math.max(0, depth - 1);
    } else if (depth > 0) {
      inside++;
    }
  }
  return inside / candidate.length > 0.5;
}

/**
 * Synthetic identity used when broadcasting the AI's typing indicator. The WS
 * protocol requires a `userId`; this sentinel keeps the payload backward
 * compatible while letting the widget distinguish AI typing later.
 */
export const AI_TYPING_USER_ID = "ai-assistant";
const AI_TYPING_USER_NAME = "AI Assistant";
const AI_SENDER_NAME = "AI Assistant";

/**
 * Interval between typing:start re-broadcasts during a turn. Clients guard
 * against a lost typing:stop with an auto-expiry timer (3s in the SDK), so a
 * single typing:start would vanish mid-turn — the heartbeat keeps it alive
 * for the whole multi-step tool loop.
 */
const AI_TYPING_HEARTBEAT_MS = 2_000;

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

function startAiTyping(conversation: TurnConversation): NodeJS.Timeout {
  const emit = (): void => {
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
      console.error(
        "[ai-turn] typing:start broadcast failed",
        conversation.id,
        err,
      );
    }
  };
  emit();
  return setInterval(emit, AI_TYPING_HEARTBEAT_MS);
}

function stopAiTyping(
  conversation: TurnConversation,
  heartbeat: NodeJS.Timeout,
): void {
  clearInterval(heartbeat);
  try {
    broadcastRoomEvent(
      conversation.id,
      buildTypingStopEvent({
        conversationId: conversation.id,
        userId: AI_TYPING_USER_ID,
      }),
    );
  } catch (err) {
    console.error(
      "[ai-turn] typing:stop broadcast failed",
      conversation.id,
      err,
    );
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
  let typingHeartbeat: NodeJS.Timeout | null = null;

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
      console.debug(
        "[ai-turn] skipped: not an AI-handled live turn",
        conversationId,
      );
      return;
    }
    if (!isAiTurnEntitled({ organization, application })) {
      console.debug(
        "[ai-turn] skipped: org/application not entitled",
        conversationId,
      );
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

    typingHeartbeat = startAiTyping(conversation);

    // ── Assemble tools (escalate + permitted data tools) ──
    const turnCtx: TurnEscalationContext = { escalation: null };
    const toolset = await loadDataToolset(application.id);
    // Both HTTP and SQL tools share the org add-on entitlement (already
    // verified above via `isAiTurnEntitled`). SQL additionally requires the
    // per-application `aiDbEnabled` opt-in.
    const tools = assembleTools({
      applicationId: application.id,
      conversationId,
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

    const provider = createAIProvider(env.AI_MODEL, env.OPENROUTER_API_KEY);
    const providerMessages = buildTurnMessages(turnMessages);
    const usageUserId =
      conversation.createdBy ?? latestVisitor?.senderId ?? organization.id;

    // ── Run the tool loop through the shared orchestrator (usage logged). The
    // closure is reused verbatim for the degenerate-reply retry below, so both
    // attempts share the same action/usage accounting. ──
    const runModel = (
      messages: AIProviderMessage[],
    ): Promise<AIProviderToolsResponse> =>
      runAICall<AIProviderToolsResponse, AIProviderToolsResponse>({
        action: "autonomous_reply",
        tenantId: organization.id,
        userId: usageUserId,
        conversationId,
        model: env.AI_MODEL,
        providerCall: async () => {
          const r = await provider.generateWithTools({
            systemPrompt,
            messages,
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

    let result: AIProviderToolsResponse;
    try {
      result = await runModel(providerMessages);
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
    console.debug("[ai-turn] turn result", {
      conversationId,
      finishReason: result.finishReason,
      toolCalls: result.toolCalls.map((tc) => tc.toolName),
      textLength: (result.text ?? "").trim().length,
      escalated: turnCtx.escalation !== null,
    });
    if (turnCtx.escalation) {
      await escalateConversation({
        conversation,
        reason: turnCtx.escalation.reason,
        kind: "knowledge_gap",
      });
      return;
    }

    let text = (result.text ?? "").trim();
    if (text === "") {
      await escalateConversation({
        conversation,
        reason: "no_answer",
        kind: "knowledge_gap",
      });
      return;
    }

    // ── Degenerate-reply guard: on weaker models the final text is sometimes
    // echoed tool-call JSON. Never let that reach the visitor — retry ONCE with
    // a corrective instruction, then escalate rather than send a second blob. ──
    if (isDegenerateJsonReply(text)) {
      console.warn(
        "[ai-turn] degenerate JSON reply — retrying",
        conversationId,
      );
      let retry: AIProviderToolsResponse;
      try {
        retry = await runModel([
          ...providerMessages,
          { role: "user", content: DEGENERATE_RETRY_PROMPT },
        ]);
      } catch (err) {
        console.error(
          "[ai-turn] degenerate-reply retry failed",
          conversationId,
          err,
        );
        await escalateConversation({
          conversation,
          reason: "turn_failed",
          kind: "turn_failed",
        });
        return;
      }

      const retryText = (retry.text ?? "").trim();
      if (retryText === "" || isDegenerateJsonReply(retryText)) {
        await escalateConversation({
          conversation,
          reason: "degenerate_reply",
          kind: "turn_failed",
        });
        return;
      }
      text = retryText;
    }

    // ── Pre-send recheck: an operator may have accepted (or closed) the
    // conversation during the multi-second LLM call — drop the stale reply
    // rather than talk over the human. ──
    const live = await loadConversationLiveState(conversationId);
    if (
      !live ||
      live.handledBy !== "ai" ||
      live.assignedTo !== null ||
      live.status === "closed"
    ) {
      console.debug(
        "[ai-turn] dropped reply: conversation taken over or closed mid-turn",
        conversationId,
      );
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
    if (typingHeartbeat !== null && ctx) {
      stopAiTyping(ctx.conversation, typingHeartbeat);
    }
    const rerunPending = releaseTurnLock(conversationId);
    if (rerunPending) {
      // A visitor message arrived (and was debounced) while this turn ran —
      // run one more turn so it never goes unanswered. Fire-and-forget,
      // mirroring trigger.ts; the rerun consumes the flag, so this cannot
      // loop without a fresh debounced call.
      void runAiTurn(conversationId).catch((err) => {
        console.error(
          "[ai-turn] rerun rejected unexpectedly",
          conversationId,
          err,
        );
      });
    }
  }
}
