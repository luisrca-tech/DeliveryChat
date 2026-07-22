import { describe, it, expect } from "vitest";
import {
  classifyProviderException,
  isRetryable,
  retryDelayMs,
} from "../ai.errorPolicy.js";
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

// Shaped like the AI SDK's APICallError on a Groq 429: the retry-after header
// (seconds) is the contract; the message text is informational only.
function apiCallError429(retryAfter?: string): Error {
  const responseHeaders: Record<string, string> = {
    "content-type": "application/json",
  };
  if (retryAfter !== undefined) responseHeaders["retry-after"] = retryAfter;
  return Object.assign(
    new Error("Rate limit reached. Please try again in 4.8675s"),
    { statusCode: 429, responseHeaders },
  );
}

describe("rate-limit retry-after policy", () => {
  it("extracts retryAfterMs from a short retry-after header and marks it retryable", () => {
    const result = classifyProviderException(apiCallError429("5"));

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBe(5000);
    expect(isRetryable(result)).toBe(true);
    expect(retryDelayMs(result)).toBe(5000);
  });

  it("extracts retryAfterMs from a long retry-after header but keeps it non-retryable", () => {
    const result = classifyProviderException(apiCallError429("3600"));

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBe(3_600_000);
    expect(isRetryable(result)).toBe(false);
  });

  it("leaves retryAfterMs undefined and non-retryable when the header is absent", () => {
    const result = classifyProviderException(apiCallError429());

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBeUndefined();
    expect(isRetryable(result)).toBe(false);
    expect(retryDelayMs(result)).toBeNull();
  });

  it("leaves retryAfterMs undefined and non-retryable when the header is garbage", () => {
    const result = classifyProviderException(apiCallError429("soon"));

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBeUndefined();
    expect(isRetryable(result)).toBe(false);
    expect(retryDelayMs(result)).toBeNull();
  });

  it("extracts retryAfterMs from the inner error of a RetryError-wrapped 429", () => {
    const inner429 = apiCallError429("5");
    const result = classifyProviderException(
      retryErrorLike({ lastError: inner429, errors: [inner429] }),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBe(5000);
    expect(isRetryable(result)).toBe(true);
  });

  it("returns null delay for non-rate-limit errors", () => {
    expect(retryDelayMs(new AIProviderError("boom"))).toBeNull();
    expect(retryDelayMs(new Error("boom"))).toBeNull();
  });
});

// Shaped like the AI SDK's APICallError raised from an OpenRouter response.
// OpenRouter returns `{ error: { code, message, metadata? } }` with the HTTP
// status mirroring error.code; the SDK surfaces `statusCode`, `responseHeaders`
// and the parsed body on `data`. 429/503 may send a Retry-After header (seconds).
function openRouterApiCallError(
  statusCode: number,
  message: string,
  retryAfter?: string,
): Error {
  const responseHeaders: Record<string, string> = {
    "content-type": "application/json",
  };
  if (retryAfter !== undefined) responseHeaders["retry-after"] = retryAfter;
  return Object.assign(new Error(message), {
    statusCode,
    responseHeaders,
    data: { error: { code: statusCode, message } },
  });
}

describe("OpenRouter-shaped provider errors", () => {
  it("maps a 429 with a short retry-after to a retryable rate-limit error", () => {
    const result = classifyProviderException(
      openRouterApiCallError(429, "Rate limit exceeded", "5"),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBe(5000);
    expect(isRetryable(result)).toBe(true);
    expect(retryDelayMs(result)).toBe(5000);
  });

  it("maps a 429 with a long retry-after to a non-retryable rate-limit error", () => {
    const result = classifyProviderException(
      openRouterApiCallError(429, "Rate limit exceeded", "60"),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBe(60_000);
    expect(isRetryable(result)).toBe(false);
  });

  it("maps a 429 without a retry-after header to a non-retryable rate-limit error", () => {
    const result = classifyProviderException(
      openRouterApiCallError(429, "Rate limit exceeded"),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBeUndefined();
    expect(isRetryable(result)).toBe(false);
    expect(retryDelayMs(result)).toBeNull();
  });

  it("maps a 502 (model down) to a retryable generic provider error", () => {
    const result = classifyProviderException(
      openRouterApiCallError(
        502,
        "Model is down or returned an invalid response",
      ),
    );

    expect(result).toBeInstanceOf(AIProviderError);
    expect(result).not.toBeInstanceOf(AIProviderRateLimitError);
    expect(isRetryable(result)).toBe(true);
  });

  it("maps a 503 (no available provider) to a retryable generic provider error", () => {
    const result = classifyProviderException(
      openRouterApiCallError(
        503,
        "No provider meets the routing requirements",
        "30",
      ),
    );

    expect(result).toBeInstanceOf(AIProviderError);
    expect(result).not.toBeInstanceOf(AIProviderRateLimitError);
    expect(isRetryable(result)).toBe(true);
  });

  it("unwraps a RetryError-wrapped OpenRouter 429 and classifies it as rate-limit", () => {
    const inner = openRouterApiCallError(429, "Rate limit exceeded", "5");
    const result = classifyProviderException(
      retryErrorLike({ lastError: inner, errors: [inner] }),
    );

    expect(result).toBeInstanceOf(AIProviderRateLimitError);
    expect((result as AIProviderRateLimitError).retryAfterMs).toBe(5000);
    expect(isRetryable(result)).toBe(true);
  });
});
