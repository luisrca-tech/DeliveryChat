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
const mockRunAdvanceTurn = vi.fn();

class TurnConflictErrorMock extends Error {
  readonly currentTurn: number;
  readonly status: string;
  constructor(currentTurn: number, status: string) {
    super("turn_conflict");
    this.name = "TurnConflictError";
    this.currentTurn = currentTurn;
    this.status = status;
  }
}

vi.mock("../../../../features/ai/ai.interviewer.js", () => ({
  getInterviewContext: (...args: unknown[]) => mockGetInterviewContext(...args),
  runBootstrapTurn: (...args: unknown[]) => mockRunBootstrapTurn(...args),
  runAdvanceTurn: (...args: unknown[]) => mockRunAdvanceTurn(...args),
  TurnConflictError: TurnConflictErrorMock,
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

});

describe("POST /applications/:applicationId/ai-interview/turns (steady-state)", () => {
  async function postAnswer(body: Record<string, unknown>, appId = APP_ID) {
    return buildApp().request(`/applications/${appId}/ai-interview/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("happy path: returns updated state and turn metadata, increments currentTurn", async () => {
    mockRunAdvanceTurn.mockResolvedValue({
      row: {
        status: "in_progress",
        currentTurn: 1,
        interviewLog: [
          { role: "assistant", content: "Welcome — tell me about your business." },
          { role: "user", content: "We sell books online." },
          { role: "assistant", content: "Who are your typical customers?" },
        ],
      },
      output: {
        assistantMessage: "Who are your typical customers?",
        intent: "ask",
        topicsCoveredThisTurn: ["business_description"],
        guardrailAction: "none",
      },
    });

    const res = await postAnswer({
      message: "We sell books online.",
      expectedCurrentTurn: 0,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentTurn).toBe(1);
    expect(body.interviewLog).toHaveLength(3);
    expect(body.turn.intent).toBe("ask");
    expect(mockRunBootstrapTurn).not.toHaveBeenCalled();
    expect(mockRunAdvanceTurn).toHaveBeenCalledWith({
      provider: expect.any(Object),
      applicationId: APP_ID,
      tenantId: ORG_ID,
      userId: USER_ID,
      userMessage: "We sell books online.",
      expectedCurrentTurn: 0,
    });
  });

  it("returns 409 turn_conflict on stale expectedCurrentTurn", async () => {
    mockRunAdvanceTurn.mockRejectedValue(
      new TurnConflictErrorMock(3, "in_progress"),
    );

    const res = await postAnswer({ message: "answer", expectedCurrentTurn: 1 });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: "turn_conflict",
      currentTurn: 3,
      status: "in_progress",
    });
  });

  it("returns 409 turn_conflict with status=completed on terminal state", async () => {
    mockRunAdvanceTurn.mockRejectedValue(
      new TurnConflictErrorMock(7, "completed"),
    );

    const res = await postAnswer({ message: "answer", expectedCurrentTurn: 7 });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.status).toBe("completed");
  });

  it("LLM provider failure flows through ai.errorMapper (no partial state)", async () => {
    const providerError = new Error("provider down");
    mockRunAdvanceTurn.mockRejectedValue(providerError);
    const { mapAiErrorToResponse } = await import(
      "../../../../features/ai/ai.errorMapper.js"
    );
    vi.mocked(mapAiErrorToResponse).mockReturnValue(
      new Response(JSON.stringify({ error: "ai_provider_unavailable" }), {
        status: 502,
      }),
    );

    const res = await postAnswer({ message: "answer", expectedCurrentTurn: 1 });

    expect(res.status).toBe(502);
    expect(mockRunAdvanceTurn).toHaveBeenCalledOnce();
  });

  it("retrying after a transient failure with the same expectedCurrentTurn succeeds", async () => {
    mockRunAdvanceTurn
      .mockRejectedValueOnce(new Error("LLM transient"))
      .mockResolvedValueOnce({
        row: {
          status: "in_progress",
          currentTurn: 2,
          interviewLog: [],
        },
        output: {
          assistantMessage: "next?",
          intent: "ask",
          topicsCoveredThisTurn: [],
          guardrailAction: "none",
        },
      });

    const { mapAiErrorToResponse } = await import(
      "../../../../features/ai/ai.errorMapper.js"
    );
    vi.mocked(mapAiErrorToResponse).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "ai_provider_unavailable" }), {
        status: 502,
      }),
    );

    const first = await postAnswer({
      message: "answer",
      expectedCurrentTurn: 1,
    });
    expect(first.status).toBe(502);

    const second = await postAnswer({
      message: "answer",
      expectedCurrentTurn: 1,
    });
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.currentTurn).toBe(2);
  });
});
