import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const APP_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_APP_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "org-1";
const USER_ID = "user-1";

vi.mock("../../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    AI_INTERVIEW_MODEL: "mock://interview",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

// The route's findOwnedApplication does a select->from->where->limit chain.
// We mock db.select to return that chain, configurable per test.
const ownedApplicationRows: { id: string }[] = [];
const dbMock = {
  select: vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => ownedApplicationRows,
      }),
    }),
  })),
};

vi.mock("../../../../db/index.js", () => ({ db: dbMock }));

vi.mock("../../../../db/schema/applications.js", () => ({
  applications: {
    id: "id",
    organizationId: "organizationId",
    deletedAt: "deletedAt",
  },
}));

let mockAuthContext:
  | null
  | {
      user: { id: string; name: string };
      organization: { id: string; plan: string; name: string };
      membership: { id: string; role: string; userId: string; organizationId: string };
    } = null;

vi.mock("../../../../lib/middleware/auth.js", () => ({
  requireTenantAuth:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      if (!mockAuthContext) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
        });
      }
      c.set("auth", mockAuthContext);
      await next();
    },
  getTenantAuth: (c: { get: (k: string) => unknown }) => c.get("auth"),
  requireRole:
    (minRole: "operator" | "admin" | "super_admin") =>
    async (
      c: { get: (k: string) => unknown },
      next: () => Promise<void>,
    ) => {
      const auth = c.get("auth") as { membership: { role: string } } | null;
      const rank: Record<string, number> = {
        operator: 1,
        admin: 2,
        super_admin: 3,
      };
      const current = rank[auth?.membership.role ?? ""] ?? 0;
      if (current < (rank[minRole] ?? 0)) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
        });
      }
      await next();
    },
}));

let billingAllowed = true;
vi.mock("../../../../lib/middleware/billing.js", () => ({
  checkBillingStatus: () => async (_c: unknown, next: () => Promise<void>) => {
    if (!billingAllowed) {
      return new Response(JSON.stringify({ error: "billing" }), { status: 402 });
    }
    await next();
  },
}));

let aiFeatureAllowed = true;
vi.mock("../../../../features/ai/ai.middleware.js", () => ({
  requireAiFeature: () => async (_c: unknown, next: () => Promise<void>) => {
    if (!aiFeatureAllowed) {
      return new Response(
        JSON.stringify({ error: "ai_feature_not_available" }),
        { status: 403 },
      );
    }
    await next();
  },
}));

const mockGetInterviewContext = vi.fn();
const mockRunBootstrapTurn = vi.fn();
vi.mock("../../../../features/ai/ai.interviewer.js", () => ({
  getInterviewContext: (...args: unknown[]) => mockGetInterviewContext(...args),
  runBootstrapTurn: (...args: unknown[]) => mockRunBootstrapTurn(...args),
}));

vi.mock("../../../../features/ai/ai.provider.js", () => ({
  createAIProvider: vi.fn(() => ({ generateText: vi.fn(), generateObject: vi.fn() })),
}));

vi.mock("../../../../features/ai/ai.errorMapper.js", () => ({
  mapAiErrorToResponse: vi.fn(() => null),
}));

const { aiInterviewRoute } = await import("../index.js");

function adminAuth() {
  return {
    user: { id: USER_ID, name: "Admin" },
    organization: { id: ORG_ID, plan: "PREMIUM", name: "Test Org" },
    membership: { id: "m-1", role: "admin", userId: USER_ID, organizationId: ORG_ID },
  };
}

function operatorAuth() {
  return {
    ...adminAuth(),
    membership: { id: "m-1", role: "operator", userId: USER_ID, organizationId: ORG_ID },
  };
}

function buildApp() {
  return new Hono().route("/applications", aiInterviewRoute);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthContext = adminAuth();
  billingAllowed = true;
  aiFeatureAllowed = true;
  ownedApplicationRows.length = 0;
  ownedApplicationRows.push({ id: APP_ID });
});

describe("GET /applications/:applicationId/ai-interview", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuthContext = null;
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuthContext = operatorAuth();
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for cross-tenant application", async () => {
    ownedApplicationRows.length = 0;
    const res = await buildApp().request(`/applications/${OTHER_APP_ID}/ai-interview`);
    expect(res.status).toBe(404);
  });

  it("returns not_started sentinel when no row exists", async () => {
    mockGetInterviewContext.mockResolvedValue(null);
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "not_started" });
  });

  it("returns persisted state when row exists", async () => {
    mockGetInterviewContext.mockResolvedValue({
      status: "in_progress",
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "Hi!" }],
    });
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "in_progress",
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "Hi!" }],
    });
  });
});

describe("POST /applications/:applicationId/ai-interview/turns (bootstrap)", () => {
  function bootstrapBody() {
    return JSON.stringify({ expectedCurrentTurn: 0 });
  }

  async function postBootstrap(appId = APP_ID) {
    return buildApp().request(
      `/applications/${appId}/ai-interview/turns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bootstrapBody(),
      },
    );
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuthContext = null;
    expect((await postBootstrap()).status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuthContext = operatorAuth();
    expect((await postBootstrap()).status).toBe(403);
  });

  it("returns 402 when billing is not allowed", async () => {
    billingAllowed = false;
    expect((await postBootstrap()).status).toBe(402);
  });

  it("returns 403 when AI feature is not available", async () => {
    aiFeatureAllowed = false;
    expect((await postBootstrap()).status).toBe(403);
  });

  it("returns 404 for cross-tenant application", async () => {
    ownedApplicationRows.length = 0;
    expect((await postBootstrap(OTHER_APP_ID)).status).toBe(404);
  });

  it("returns 422 when body is invalid", async () => {
    const res = await buildApp().request(
      `/applications/${APP_ID}/ai-interview/turns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCurrentTurn: 99 }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("bootstrap happy path returns state and turn metadata", async () => {
    mockRunBootstrapTurn.mockResolvedValue({
      row: {
        status: "in_progress",
        currentTurn: 0,
        interviewLog: [{ role: "assistant", content: "Hello!" }],
      },
      output: {
        assistantMessage: "Hello!",
        intent: "ask",
        topicsCoveredThisTurn: ["business_description"],
        guardrailAction: "none",
      },
    });

    const res = await postBootstrap();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("in_progress");
    expect(body.currentTurn).toBe(0);
    expect(body.interviewLog).toEqual([{ role: "assistant", content: "Hello!" }]);
    expect(body.turn).toEqual({
      intent: "ask",
      topicsCoveredThisTurn: ["business_description"],
      guardrailAction: "none",
    });

    expect(mockRunBootstrapTurn).toHaveBeenCalledWith({
      provider: expect.any(Object),
      applicationId: APP_ID,
      tenantId: ORG_ID,
      userId: USER_ID,
    });
  });

  it("rejects steady-state body (Phase 2) with 422 not_implemented", async () => {
    const res = await buildApp().request(
      `/applications/${APP_ID}/ai-interview/turns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "answer", expectedCurrentTurn: 1 }),
      },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("not_implemented");
  });
});
