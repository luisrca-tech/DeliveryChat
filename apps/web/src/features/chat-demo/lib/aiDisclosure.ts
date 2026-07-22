/**
 * Opening AI-disclosure line for the demo chat.
 *
 * Mirrors the SDK's `buildAiDisclosureMessage` / `seedDisclosureIfNeeded`
 * (packages/sdk/src/aiConversationLifecycle.ts). The disclosure is legally
 * required bot disclosure (California B.O.T. Act; EU AI Act transparency), not
 * polish — so the demo shows the same line the real widget does, word for word.
 *
 * See also `./handoffOffer.ts`, which carries the same sync obligation.
 */

/** The settings fields the disclosure reads. Application settings are
 * free-form JSONB, so every field is optional. */
export type DisclosureSettings = {
  header?: { title?: string };
  ai?: { assistantLabel?: string };
};

export function disclosureText(settings: DisclosureSettings): string {
  const assistantLabel = settings?.ai?.assistantLabel ?? "AI Assistant";
  const tenantName = settings?.header?.title || "our";
  return `Hi! I'm ${tenantName}'s ${assistantLabel}. I can help you — or connect you to a person anytime.`;
}

export type SeedDisclosureInput = {
  aiEnabled: boolean;
  conversationId: string | null;
  messageCount: number;
  loadingMessages: boolean;
  alreadySeeded: boolean;
};

/**
 * Whether to seed the disclosure into a conversation.
 *
 * The empty-thread guard is what makes this correct for both entry points, the
 * same way it does in the SDK: a brand-new chat has no messages (seed), while
 * reopening an existing thread restores history (don't seed — the visitor was
 * already told). `loadingMessages` matters because mid-load the count is 0 but
 * not yet known, and seeding there would flash a greeting onto a thread that
 * turns out to have history.
 */
export function shouldSeedDisclosure(input: SeedDisclosureInput): boolean {
  return (
    input.aiEnabled &&
    input.conversationId !== null &&
    !input.loadingMessages &&
    input.messageCount === 0 &&
    !input.alreadySeeded
  );
}
