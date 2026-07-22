import type { Conversation } from "../chat-client";

/**
 * "Talk to a human" button rule for the marketing demo chat.
 *
 * The demo is a bespoke client — it talks to the same `/api/v1/widget`
 * endpoints as the real widget but shares no UI code with `@deliverychat/sdk`,
 * so this mirrors the SDK's `handoffOffer`
 * (packages/sdk/src/aiConversationLifecycle.ts). Keep the two in sync: if the
 * escalation-offer invariant changes there, change it here too.
 *
 * The rules differ only where the two clients' data models differ. The SDK
 * tags messages with `authorType`; the demo's `Message` has no such field, so
 * an operator is inferred as "a non-system message from someone other than
 * this visitor".
 */

/** The message fields the rule actually reads. */
export type HandoffMessage = {
  senderId: string;
  type: string;
};

export type HandoffOfferInput = {
  /** `settings.ai.enabled` — server-derived AI entitlement for this app. */
  aiEnabled: boolean;
  conversation: Conversation | undefined;
  messages: HandoffMessage[];
  visitorUserId: string | null;
  humanRequested: boolean;
};

export type HandoffOffer = {
  hidden: boolean;
  disabled: boolean;
};

/**
 * Derives the button's `{ hidden, disabled }` state. Pure — no fetch, no React
 * — so the invariant is testable directly.
 *
 * - Hidden when AI is off, or before a conversation is selected. Without AI
 *   there is nothing to escalate *from*; the visitor already has humans.
 * - Disabled once escalated, once an operator has spoken, or once the
 *   conversation is closed — each means the click would be a no-op or a 409.
 */
export function handoffOffer(input: HandoffOfferInput): HandoffOffer {
  const { aiEnabled, conversation, messages, visitorUserId, humanRequested } =
    input;

  // Before the visitor's own user id is known, every senderId looks foreign —
  // so operator detection is not yet possible. Escalation is idempotent
  // server-side, so leaving the button enabled is the safe side to err on.
  const operatorHasSpoken =
    visitorUserId !== null &&
    messages.some((m) => m.type !== "system" && m.senderId !== visitorUserId);

  return {
    hidden: !aiEnabled || !conversation,
    disabled:
      humanRequested || operatorHasSpoken || conversation?.status === "closed",
  };
}
