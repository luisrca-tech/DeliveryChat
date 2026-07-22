import { getState, setState } from "./state.js";
import type { ChatMessage, WidgetSettings } from "./types/index.js";

/**
 * Single seam for the "this conversation is AI-fronted" lifecycle (plan §8):
 * discloses the bot, announces the human takeover once, and owns the escalation
 * flags. Concentrating this here keeps the three visitor-facing rules — legally
 * required disclosure (California B.O.T. Act; EU AI Act transparency), the
 * one-time takeover line, and flag resets — in one place instead of smeared
 * across init(), startNewChat(), destroyChat() and the message router.
 *
 * The module uses the existing `getState`/`setState` seam internally so callers
 * refactor to one-liners.
 */

/**
 * Client-side "takeover moment" line (plan §8): rendered once, the first time
 * an operator message arrives in a conversation that already had an AI message.
 * The server may later own this line — see docs/system-messages.md.
 */
const AI_TAKEOVER_MESSAGE = "You're now chatting with a team member.";

/**
 * Opening AI-disclosure line (plan §8) — legally required bot disclosure
 * (California B.O.T. Act; EU AI Act transparency), not polish. Rendered
 * client-side as a system-style row, before any real message exists, only
 * when the application's AI entitlement is on (`settings.ai.enabled`,
 * server-derived — see apps/hono-api routes/widget.ts).
 */
function buildAiDisclosureMessage(settings: WidgetSettings): ChatMessage {
  const assistantLabel = settings.ai?.assistantLabel ?? "AI Assistant";
  const tenantName = settings.header.title || "our";
  return {
    id: `ai-disclosure-${crypto.randomUUID()}`,
    content: `Hi! I'm ${tenantName}'s ${assistantLabel}. I can help you — or connect you to a person anytime.`,
    type: "system",
    senderRole: "operator",
    senderId: "",
    status: "sent",
    createdAt: new Date().toISOString(),
    authorType: "system",
  };
}

function buildTakeoverSystemMessage(): ChatMessage {
  return {
    id: `client-takeover-${crypto.randomUUID()}`,
    content: AI_TAKEOVER_MESSAGE,
    type: "system",
    senderRole: "operator",
    senderId: "",
    status: "sent",
    createdAt: new Date().toISOString(),
    authorType: "system",
  };
}

/**
 * Seeds the opening AI-disclosure line, guarded by a single rule used by both
 * `init()` and `startNewChat()`: seed only when AI is enabled **and** the
 * message list is empty. The empty-list guard is what makes both call sites
 * correct — `init()` may have restored conversation history (non-empty, no
 * disclosure), while `startNewChat()` clears messages first (empty, seeds).
 */
export function seedDisclosureIfNeeded(settings: WidgetSettings): void {
  if (getState("messages").length !== 0) return;
  if (!settings?.ai?.enabled) return;
  setState("messages", [buildAiDisclosureMessage(settings)]);
}

/**
 * Appends an incoming (non-duplicate) message, inserting the one-time takeover
 * line before it when the takeover rule fires: the first operator message in a
 * conversation that already had at least one AI message. Idempotent via
 * `state.aiTakeoverAnnounced` — it renders at most once per conversation.
 */
export function onIncomingMessage(newMsg: ChatMessage): void {
  const prevMessages = getState("messages");

  const announceTakeover =
    !getState("aiTakeoverAnnounced") &&
    newMsg.authorType === "operator" &&
    prevMessages.some((m) => m.authorType === "ai");

  setState("messages", (prev) =>
    announceTakeover
      ? [...prev, buildTakeoverSystemMessage(), newMsg]
      : [...prev, newMsg],
  );

  if (announceTakeover) {
    setState("aiTakeoverAnnounced", true);
  }
}

/**
 * Resets every AI-lifecycle flag when a conversation ends or restarts. Owns
 * ALL flag resets so no call site has to remember the full set.
 */
export function resetForNewConversation(): void {
  setState("humanRequested", false);
  setState("aiTakeoverAnnounced", false);
}

/** State slices the "Talk to a human" offer rule depends on. */
export type HandoffOfferInput = {
  /** `settings.ai.enabled` — server-derived AI entitlement for this app. */
  aiEnabled: boolean;
  conversationId: string | null;
  messages: ChatMessage[];
  humanRequested: boolean;
};

/** Derived visibility/disabled state for the "Talk to a human" button. */
export type HandoffOffer = {
  hidden: boolean;
  disabled: boolean;
};

/**
 * Derives the "Talk to a human" button's `{ hidden, disabled }` state (plan §8,
 * AC #4) from conversation + escalation state. Pure — no DOM, no `getState` — so
 * the escalation-offer invariant is testable directly.
 *
 * - Hidden when AI is off for this application. There is nothing to escalate
 *   *from* — the visitor is already talking to humans — so offering to connect
 *   them to one is noise. Gated on the same server-derived `settings.ai.enabled`
 *   as the disclosure line, so both visitor-facing AI affordances appear and
 *   disappear together.
 * - Hidden until a conversation exists (`conversationId` is null).
 * - Disabled once already escalated (`humanRequested`) or once an operator
 *   message has arrived — either signal means the visitor is already with, or
 *   queued for, a human.
 */
export function handoffOffer(input: HandoffOfferInput): HandoffOffer {
  return {
    hidden: !input.aiEnabled || !input.conversationId,
    disabled:
      input.humanRequested ||
      input.messages.some((m) => m.authorType === "operator"),
  };
}
