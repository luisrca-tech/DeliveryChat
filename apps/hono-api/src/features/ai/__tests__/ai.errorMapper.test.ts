import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { mapAiErrorToResponse } from "../ai.errorMapper.js";
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
} from "../ai.errors.js";

function createTestContext() {
  const app = new Hono();
  let capturedResponse: Response | null = null;

  app.get("/test", (c) => {
    const error = c.req.header("x-test-error");
    const errorInstance = createError(error!);
    const response = mapAiErrorToResponse(c, errorInstance);
    capturedResponse = response;
    return response ?? c.json({ error: "unhandled" }, 500);
  });

  return { app, getCapturedResponse: () => capturedResponse };
}

function createError(type: string): Error {
  switch (type) {
    case "timeout":
      return new AITimeoutError("timed out");
    case "rate_limit":
      return new AIProviderRateLimitError("rate limited");
    case "empty_response":
      return new AIEmptyResponseError("empty");
    case "content_filtered":
      return new AIContentFilteredError("filtered");
    case "conversation_not_found":
      return new AIConversationNotFoundError("not found");
    case "application_required":
      return new AIApplicationRequiredError("no application");
    case "not_configured":
      return new AINotConfiguredError("not configured");
    case "quota_exceeded":
      return new AIQuotaExceededError("quota");
    case "provider":
      return new AIProviderError("provider error");
    case "unknown":
      return new Error("unknown error");
    default:
      return new Error("unknown");
  }
}

describe("mapAiErrorToResponse", () => {
  it("maps AITimeoutError to 504 Gateway Timeout", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "timeout" },
    });
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe("ai_timeout");
  });

  it("maps AIProviderRateLimitError to 503 Service Unavailable", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "rate_limit" },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ai_provider_busy");
  });

  it("maps AIEmptyResponseError to 422 Unprocessable Entity", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "empty_response" },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("ai_empty_response");
  });

  it("maps AIContentFilteredError to 422 Unprocessable Entity", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "content_filtered" },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("ai_content_filtered");
  });

  it("maps AIQuotaExceededError to 403 Forbidden", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "quota_exceeded" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_monthly_cap_exceeded");
  });

  it("maps AIConversationNotFoundError to 404 Not Found", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "conversation_not_found" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("conversation_not_found");
  });

  it("maps AIApplicationRequiredError to 422 Unprocessable Entity", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "application_required" },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("ai_application_required");
  });

  it("maps AINotConfiguredError to 403 Forbidden", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "not_configured" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_not_configured");
    expect(body.message).toContain("AI onboarding interview");
  });

  it("maps AIProviderError to 502 Bad Gateway", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "provider" },
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("ai_provider_unavailable");
  });

  it("returns null for unknown errors", async () => {
    const { app } = createTestContext();
    const res = await app.request("/test", {
      headers: { "x-test-error": "unknown" },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("unhandled");
  });
});
