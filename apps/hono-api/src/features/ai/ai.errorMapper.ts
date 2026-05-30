import type { Context } from "hono";
import { jsonError, HTTP_STATUS } from "../../lib/http.js";
import {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
  AIConversationNotFoundError,
  AIApplicationRequiredError,
  AINotConfiguredError,
  AIQuotaExceededError,
} from "./ai.errors.js";

export function mapAiErrorToResponse(c: Context, error: unknown): Response | null {
  if (error instanceof AIConversationNotFoundError) {
    return jsonError(c, HTTP_STATUS.NOT_FOUND, "conversation_not_found", "Conversation not found.");
  }
  if (error instanceof AIApplicationRequiredError) {
    return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "ai_application_required", "AI requires a conversation linked to an application.");
  }
  if (error instanceof AINotConfiguredError) {
    return jsonError(c, HTTP_STATUS.FORBIDDEN, "ai_not_configured", "AI is not available for this application. Contact your admin to complete the AI onboarding interview.");
  }
  if (error instanceof AITimeoutError) {
    return jsonError(c, HTTP_STATUS.GATEWAY_TIMEOUT, "ai_timeout", "AI provider timed out. Please try again.");
  }
  if (error instanceof AIProviderRateLimitError) {
    return jsonError(c, HTTP_STATUS.SERVICE_UNAVAILABLE, "ai_provider_busy", "AI provider is temporarily busy. Please try again.");
  }
  if (error instanceof AIEmptyResponseError) {
    return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "ai_empty_response", "AI could not generate a response for this conversation.");
  }
  if (error instanceof AIContentFilteredError) {
    return jsonError(c, HTTP_STATUS.UNPROCESSABLE_ENTITY, "ai_content_filtered", "AI response was blocked by content safety filters.");
  }
  if (error instanceof AIQuotaExceededError) {
    return jsonError(c, HTTP_STATUS.FORBIDDEN, "ai_monthly_cap_exceeded", "Monthly AI usage limit reached.");
  }
  if (error instanceof AIProviderError) {
    console.error("[AI] provider error:", error.message, (error as { cause?: unknown }).cause);
    return jsonError(c, HTTP_STATUS.BAD_GATEWAY, "ai_provider_unavailable", "AI provider is currently unavailable. Please try again.");
  }
  return null;
}
