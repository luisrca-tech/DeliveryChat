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
let mockRoleMinimum = "admin";

vi.mock("../../../lib/middleware/auth.js", () => ({
  requireTenantAuth:
    () =>
    async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      if (!mockAuthContext) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
        });
      }
      c.set("auth", mockAuthContext);
      await next();
    },
  getTenantAuth: (c: { get: (k: string) => unknown }) => c.get("auth"),
  requireRole: (minRole: string) => {
    const rank: Record<string, number> = {
      operator: 1,
      admin: 2,
      super_admin: 3,
    };
    return async (
      c: { get: (k: string) => unknown },
      next: () => Promise<void>,
    ) => {
      const auth = c.get("auth") as { membership: { role: string } };
      const current = rank[auth.membership.role] ?? 0;
      const required = rank[minRole] ?? 0;
      if (current < required) {
        return new Response(
          JSON.stringify({ error: "forbidden", message: "Insufficient role" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      await next();
    };
  },
}));

vi.mock("../../../lib/middleware/billing.js", () => ({
  checkBillingStatus: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../ai.middleware.js", () => ({
  requireAiFeature: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  createAiRateLimitMiddleware:
    () => async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
}));

vi.mock("../ai.service.js", () => ({
  generateReply: vi.fn(),
  improveMessage: vi.fn(),
  getAiUsageLogs: vi.fn(),
}));

const { getAiUsageLogs } = await import("../ai.service.js");
const mockGetAiUsageLogs = getAiUsageLogs as ReturnType<typeof vi.fn>;

const { aiRoute } = await import("../../../routes/ai.js");

function createMemberAuth(role = "admin", plan = "PREMIUM") {
  return {
    session: {},
    user: { id: "user-1", name: "Test Admin" },
    organization: { id: "org-1", plan, name: "Test Org" },
    membership: {
      id: "m-1",
      role,
      userId: "user-1",
      organizationId: "org-1",
    },
  };
}

describe("GET /ai/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthContext = createMemberAuth("admin");
  });

  it("returns 200 with paginated usage logs", async () => {
    const mockLogs = [
      {
        id: "log-1",
        tenantId: "org-1",
        userId: "user-1",
        operatorName: "Test Operator",
        action: "generate",
        conversationId: "conv-1",
        model: "groq/llama-3.3-70b",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 1200,
        finishReason: "stop",
        status: "success",
        createdAt: "2026-05-25T10:00:00.000Z",
      },
    ];

    mockGetAiUsageLogs.mockResolvedValue({ logs: mockLogs, total: 1 });

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/usage?limit=20&offset=0");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthContext = null;

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/usage");

    expect(res.status).toBe(401);
  });

  it("returns 403 when operator tries to access", async () => {
    mockAuthContext = createMemberAuth("operator");

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/usage");

    expect(res.status).toBe(403);
  });

  it("allows super_admin access", async () => {
    mockAuthContext = createMemberAuth("super_admin");
    mockGetAiUsageLogs.mockResolvedValue({ logs: [], total: 0 });

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/usage");

    expect(res.status).toBe(200);
  });

  it("passes filter parameters to service", async () => {
    mockGetAiUsageLogs.mockResolvedValue({ logs: [], total: 0 });

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request(
      "/ai/usage?action=generate&status=success&userId=user-2&dateFrom=2026-05-01&dateTo=2026-05-25&limit=10&offset=5",
    );

    expect(res.status).toBe(200);
    expect(mockGetAiUsageLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "org-1",
        action: "generate",
        status: "success",
        userId: "user-2",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-25",
        limit: 10,
        offset: 5,
      }),
    );
  });

  it("uses default pagination values when not provided", async () => {
    mockGetAiUsageLogs.mockResolvedValue({ logs: [], total: 0 });

    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/usage");

    expect(res.status).toBe(200);
    expect(mockGetAiUsageLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
      }),
    );
  });

  it("returns 400 for invalid action filter", async () => {
    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/usage?action=invalid");

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid status filter", async () => {
    const app = new Hono().route("/ai", aiRoute);
    const res = await app.request("/ai/usage?status=invalid");

    expect(res.status).toBe(400);
  });
});
