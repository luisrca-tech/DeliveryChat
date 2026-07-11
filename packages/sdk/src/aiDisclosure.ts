import type { ChatMessage, WidgetSettings } from "./types/index.js";

/**
 * Opening AI-disclosure line (plan §8) — legally required bot disclosure
 * (California B.O.T. Act; EU AI Act transparency), not polish. Rendered
 * client-side as a system-style row, before any real message exists, only
 * when the application's AI entitlement is on (`settings.ai.enabled`,
 * server-derived — see apps/hono-api routes/widget.ts).
 */
export function buildAiDisclosureMessage(settings: WidgetSettings): ChatMessage {
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

export function shouldShowAiDisclosure(settings: WidgetSettings): boolean {
  return Boolean(settings.ai?.enabled);
}
