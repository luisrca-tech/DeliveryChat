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

// The AI SDK wraps provider failures that exhaust its internal retries in a
// RetryError (name "AI_RetryError") whose own statusCode is undefined — the
// real APICallError lives on `lastError` (and the attempt history on
// `errors`). Duck-type the unwrap (no `ai` import) so a 429 buried in a
// RetryError is not misclassified as a retryable generic error.
function unwrapRetryError(error: unknown): unknown {
  if (error === null || typeof error !== "object") return error;

  const { lastError, errors } = error as {
    lastError?: unknown;
    errors?: unknown[];
  };
  if (lastError !== null && typeof lastError === "object") return lastError;
  if (Array.isArray(errors) && errors.length > 0) {
    const last = errors[errors.length - 1];
    if (last !== null && typeof last === "object") return last;
  }
  return error;
}

// Translate a raw SDK/network exception into a domain error. Provider adapters
// call this so they never have to know about HTTP status codes or string
// matching individually.
export function classifyProviderException(error: unknown): unknown {
  if (isAbortError(error)) return error;

  const inner = unwrapRetryError(error);

  if (
    inner instanceof Error &&
    (inner.message.includes("timeout") || inner.message.includes("ETIMEDOUT"))
  ) {
    return new AITimeoutError("AI provider timed out", { cause: error });
  }

  const statusCode =
    (inner as { statusCode?: number }).statusCode ??
    (inner as { status?: number }).status;
  if (statusCode === 429) {
    return new AIProviderRateLimitError("AI provider rate limit exceeded", {
      cause: error,
    });
  }

  return new AIProviderError("AI provider request failed", { cause: error });
}
