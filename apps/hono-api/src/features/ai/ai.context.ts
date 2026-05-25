import type { AIProviderMessage } from "./ai.provider.js";

export type ConversationMessage = {
  senderId: string | null;
  content: string;
  createdAt: string;
};

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  return `${minutes}min ago`;
}

export function buildContext(
  messages: ConversationMessage[],
  operatorId: string,
): AIProviderMessage[] {
  return messages.map((msg) => {
    const isOperator = msg.senderId === operatorId;
    const roleLabel = isOperator ? "Operator" : "Customer";
    const timeLabel = formatRelativeTime(msg.createdAt);
    const content = `[${roleLabel}, ${timeLabel}] ${msg.content}`;

    return {
      role: isOperator ? "assistant" : "user",
      content,
    } satisfies AIProviderMessage;
  });
}

export function buildSystemPrompt(tenantName: string): string {
  return [
    `You are a customer support agent for ${tenantName}.`,
    "Your job is to draft a helpful, empathetic reply to the customer.",
    "Match the language the customer is using in the conversation.",
    "Keep the reply concise, professional, and friendly.",
    "Do not invent facts or make promises you cannot keep.",
    "Reply with only the message text — no greetings prefix or signature unless the conversation context calls for it.",
  ].join(" ");
}

export function buildImprovePrompt(tenantName: string): string {
  return [
    `You are a writing assistant for a customer support agent at ${tenantName}.`,
    "The operator has written a draft reply and wants you to improve it.",
    "Rewrite the draft to be clearer, more professional, and more empathetic.",
    "Do NOT write a new reply — rewrite the operator's existing draft.",
    "Preserve the original intent, key information, and language of the draft.",
    "Match the language used by the operator in the draft.",
    "Return only the improved message text — no explanations, no alternatives.",
  ].join(" ");
}
