import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

let mockAuthContext: unknown = null;

vi.mock("../../../lib/middleware/auth.js", () => ({
  requireTenantAuth: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    if (!mockAuthContext) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    c.set("auth", mockAuthContext);
    await next();
  },
  getTenantAuth: (c: { get: (k: string) => unknown }) => c.get("auth"),
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../../../lib/middleware/billing.js", () => ({
  checkBillingStatus: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../ai.middleware.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai.middleware.js")>();
  return {
    ...actual,
    requireAiFeature: () => async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
    createAiRateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
  };
});

vi.mock("../ai.service.js", () => ({
  generateReply: vi.fn(),
  improveMessage: vi.fn(),
}));

const { generateReply, improveMessage } = await import("../ai.service.js");
const mockGenerateReply = generateReply as ReturnType<typeof vi.fn>;
const mockImproveMessage = improveMessage as ReturnType<typeof vi.fn>;

const { aiRoute } = await import("../../../routes/ai.js");

function createMemberAuth(plan = "PREMIUM") {
  return {
    session: {},
    user: { id: "user-1", name: "Test Operator" },
    organization: { id: "org-1", plan, name: "Test Org" },
    membership: { id: "m-1", role: "operator", userId: "user-1", organizationId: "org-1" },
  };
}

describe("POST /ai/generate-reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthContext = createMemberAuth();
  });

  it("returns 200 with generated text on success", async () => {
    mockGenerateReply.mockResolvedValue({ text: "Here is my suggestion." });

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "00000000-0000-0000-0000-000000000001" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("Here is my suggestion.");
  });

  it("returns 400 for invalid conversation ID format", async () => {
    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "not-a-uuid" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthContext = null;

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "00000000-0000-0000-0000-000000000001" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 422 for AI empty response error", async () => {
    const { AIEmptyResponseError } = await import("../ai.errors.js");
    mockGenerateReply.mockRejectedValue(new AIEmptyResponseError("empty"));

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "00000000-0000-0000-0000-000000000001" }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("ai_empty_response");
  });

  it("returns 504 for AI timeout error", async () => {
    const { AITimeoutError } = await import("../ai.errors.js");
    mockGenerateReply.mockRejectedValue(new AITimeoutError("timed out"));

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "00000000-0000-0000-0000-000000000001" }),
    });

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe("ai_timeout");
  });

  it("returns 502 for generic provider error", async () => {
    const { AIProviderError } = await import("../ai.errors.js");
    mockGenerateReply.mockRejectedValue(new AIProviderError("failed"));

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "00000000-0000-0000-0000-000000000001" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("ai_provider_unavailable");
  });

  it("returns 500 for unexpected errors", async () => {
    mockGenerateReply.mockRejectedValue(new Error("unexpected"));

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "00000000-0000-0000-0000-000000000001" }),
    });

    expect(res.status).toBe(500);
  });
});

describe("POST /ai/improve-message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthContext = createMemberAuth();
  });

  it("returns 200 with improved text on success", async () => {
    mockImproveMessage.mockResolvedValue({ text: "Improved message here." });

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-0000-0000-000000000001",
        draft: "i think we can help",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("Improved message here.");
  });

  it("returns 400 for missing draft", async () => {
    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-0000-0000-000000000001",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for empty draft", async () => {
    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-0000-0000-000000000001",
        draft: "",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for draft exceeding 4000 characters", async () => {
    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-0000-0000-000000000001",
        draft: "x".repeat(4001),
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid conversation ID format", async () => {
    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "not-a-uuid",
        draft: "some draft",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthContext = null;

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-0000-0000-000000000001",
        draft: "some draft",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 422 for AI empty response error", async () => {
    const { AIEmptyResponseError } = await import("../ai.errors.js");
    mockImproveMessage.mockRejectedValue(new AIEmptyResponseError("empty"));

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-0000-0000-000000000001",
        draft: "some draft",
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("ai_empty_response");
  });

  it("returns 500 for unexpected errors", async () => {
    mockImproveMessage.mockRejectedValue(new Error("unexpected"));

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/improve-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "00000000-0000-0000-0000-000000000001",
        draft: "some draft",
      }),
    });

    expect(res.status).toBe(500);
  });
});
