import { describe, it, expect } from "vitest";
import { classifyProviderException } from "../ai.errorPolicy.js";
import {
  AIProviderError,
  AIProviderRateLimitError,
  AITimeoutError,
} from "../ai.errors.js";

// Builds an object shaped like the AI SDK's RetryError (name "AI_RetryError"):
// statusCode is undefined on the wrapper — the real APICallError lives on
// `lastError` (and the full attempt history on `errors`).
function retryErrorLike(overrides: {
  lastError?: unknown;
  errors?: unknown[];
}): Error {
  const error = new Error(
    "Failed after 3 attempts. Last error: rate limited",
  ) as Error & { reason: string; lastError?: unknown; errors?: unknown[] };
  error.name = "AI_RetryError";
  error.reason = "maxRetriesExceeded";
  if ("lastError" in overrides) error.lastError = overrides.lastError;
  if ("errors" in overrides) error.errors = overrides.errors;
  return error;
}

describe("classifyProviderException", () => {
  it("maps a RetryError wrapping a 429 lastError to AIProviderRateLimitError", () => {
    const rateLimited = Object.assign(new Error("Rate limit reached"), {
      statusCode: 429,
    });
    const result = classifyProviderException(
      retryErrorLike({ lastError: rateLimited, errors: [rateLimited] }),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
  });

  it("maps a RetryError wrapping a timeout lastError to AITimeoutError", () => {
    const timedOut = new Error("Request timeout while calling provider");
    const result = classifyProviderException(
      retryErrorLike({ lastError: timedOut, errors: [timedOut] }),
    );

    expect(result).toBeInstanceOf(AITimeoutError);
  });

  it("falls back to the last element of `errors` when lastError is absent", () => {
    const rateLimited = Object.assign(new Error("Rate limit reached"), {
      statusCode: 429,
    });
    const result = classifyProviderException(
      retryErrorLike({ errors: [new Error("first failure"), rateLimited] }),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
  });

  it("still maps a plain 429 error to AIProviderRateLimitError", () => {
    const result = classifyProviderException(
      Object.assign(new Error("Too many requests"), { statusCode: 429 }),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
  });

  it("still maps a generic error to AIProviderError", () => {
    const result = classifyProviderException(new Error("boom"));

    expect(result).toBeInstanceOf(AIProviderError);
    expect(result).not.toBeInstanceOf(AITimeoutError);
  });

  it("passes AbortError through untouched", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";

    expect(classifyProviderException(abort)).toBe(abort);
  });
});
