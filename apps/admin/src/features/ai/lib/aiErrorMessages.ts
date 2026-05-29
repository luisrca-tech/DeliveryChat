import type { AiErrorCode } from "../types/ai.types";

const ERROR_MESSAGES: Record<AiErrorCode, string> = {
  ai_timeout: "AI took too long to respond. Please try again.",
  ai_provider_busy: "AI is temporarily busy. Please try again in a moment.",
  ai_provider_unavailable:
    "AI service is currently unavailable. Please try again later.",
  ai_empty_response:
    "Sorry, AI couldn't generate a response for this conversation.",
  ai_content_filtered:
    "Sorry, AI couldn't generate a suitable response for this conversation.",
  ai_monthly_cap_exceeded:
    "Your organization has reached the monthly AI usage limit.",
  ai_feature_not_available: "AI assistant is not available on your current plan.",
  ai_rate_limit_exceeded: "Too many AI requests. Please wait before trying again.",
  ai_not_configured:
    "AI is not set up for this application yet. Ask an admin to complete the AI onboarding interview before using the assistant.",
  ai_application_required:
    "This conversation is not linked to an application, so AI can't be used here.",
  conversation_not_found:
    "This conversation no longer exists or you don't have access to it.",
};

export function getAiErrorMessage(
  code: string,
  retryAfter?: number,
  serverMessage?: string,
): string {
  const base = ERROR_MESSAGES[code as AiErrorCode];

  if (!base) {
    if (serverMessage && serverMessage.trim().length > 0) {
      return serverMessage;
    }
    return `AI request failed${code && code !== "unknown_error" ? ` (${code})` : ""}. Please try again, and contact support if the problem persists.`;
  }

  if (code === "ai_rate_limit_exceeded" && retryAfter) {
    return `Too many AI requests. Please wait ${retryAfter} seconds before trying again.`;
  }

  return base;
}
