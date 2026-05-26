import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateReplyRequest, AiApiError } from "./ai.client";

vi.mock("@/lib/urls", () => ({
  getApiBaseUrl: () => "http://localhost:8000/api/v1",
}));

vi.mock("@/lib/tenantHeaders", () => ({
  getTenantHeaders: ({ json }: { json?: boolean } = {}) => {
    const headers: Record<string, string> = {
      Authorization: "Bearer test-token",
      "X-Tenant-Slug": "test-tenant",
    };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  },
}));

describe("generateReplyRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST request with correct body and returns text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "Hello, how can I help?" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await generateReplyRequest("conv-123");

    expect(result).toEqual({ text: "Hello, how can I help?" });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/ai/generate-reply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123" }),
      }),
    );
  });

  it("throws AiApiError with error code on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "ai_monthly_cap_exceeded",
          message: "Monthly AI usage limit reached.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    try {
      await generateReplyRequest("conv-123");
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AiApiError);
      const err = e as AiApiError;
      expect(err.code).toBe("ai_monthly_cap_exceeded");
      expect(err.status).toBe(403);
    }
  });

  it("parses Retry-After header on rate limit response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "ai_rate_limit_exceeded",
          message: "Rate limited",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      ),
    );

    try {
      await generateReplyRequest("conv-123");
    } catch (e) {
      const err = e as AiApiError;
      expect(err.code).toBe("ai_rate_limit_exceeded");
      expect(err.retryAfter).toBe(30);
    }
  });

  it("passes abort signal to fetch", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "reply" }), { status: 200 }),
    );

    await generateReplyRequest("conv-123", controller.signal);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
