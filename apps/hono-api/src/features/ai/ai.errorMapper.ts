import type { Context } from "hono";
import { jsonError, HTTP_STATUS } from "../../lib/http.js";
import {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
  AIEmptyResponseError,
  AIContentFilteredError,
  AIQuotaExceededError,
} from "./ai.errors.js";

export function mapAiErrorToResponse(c: Context, error: unknown): Response | null {
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
    return jsonError(c, HTTP_STATUS.BAD_GATEWAY, "ai_provider_unavailable", "AI provider is currently unavailable. Please try again.");
  }
  return null;
}
