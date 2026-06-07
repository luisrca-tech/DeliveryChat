import {
  AIContentFilteredError,
  AIEmptyResponseError,
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
} from "./ai.errors.js";

// Single source of truth for AI provider error semantics. Owns:
//  - retry eligibility (callOrchestrator)
//  - mapping raw SDK exceptions to domain errors (provider adapters)
//  - usage-log status classification
//
// Other modules must not branch on `error instanceof AI*` for retry/status
// purposes — call helpers here instead so the policy stays in one place.

export type UsageStatus =
  | "success"
  | "provider_error"
  | "timeout"
  | "empty"
  | "content_filtered"
  | "aborted";

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// Errors that callers must surface immediately without retrying or remapping.
export function isTerminal(error: unknown): boolean {
  return (
    error instanceof AIEmptyResponseError ||
    error instanceof AIContentFilteredError
  );
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof AIProviderRateLimitError) return false;
  if (error instanceof AIProviderError) return true;
  return false;
}

export function usageStatusFor(error: unknown): UsageStatus {
  if (error instanceof AITimeoutError) return "timeout";
  return "provider_error";
}

// Translate a raw SDK/network exception into a domain error. Provider adapters
// call this so they never have to know about HTTP status codes or string
// matching individually.
export function classifyProviderException(error: unknown): unknown {
  if (isAbortError(error)) return error;

  if (
    error instanceof Error &&
    (error.message.includes("timeout") || error.message.includes("ETIMEDOUT"))
  ) {
    return new AITimeoutError("AI provider timed out", { cause: error });
  }

  const statusCode =
    (error as { statusCode?: number }).statusCode ??
    (error as { status?: number }).status;
  if (statusCode === 429) {
    return new AIProviderRateLimitError("AI provider rate limit exceeded", {
      cause: error,
    });
  }

  return new AIProviderError("AI provider request failed", { cause: error });
}
