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
const userRows: { name: string }[] = [];
let selectMode: "application" | "user" = "application";
const dbMock = {
  select: vi.fn((shape?: Record<string, unknown>) => {
    selectMode = shape && "name" in shape ? "user" : "application";
    return {
      from: () => ({
        where: () => ({
          limit: async () =>
            selectMode === "user" ? userRows : ownedApplicationRows,
        }),
      }),
    };
  }),
};

vi.mock("../../../../db/index.js", () => ({ db: dbMock }));

vi.mock("../../../../db/schema/applications.js", () => ({
  applications: {
    id: "id",
    organizationId: "organizationId",
    deletedAt: "deletedAt",
  },
}));

vi.mock("../../../../db/schema/users.js", () => ({
  user: { id: "id", name: "name" },
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
const mockRunInterviewTurn = vi.fn();
const mockRunInterviewComplete = vi.fn();
const mockRunGenerateSummary = vi.fn();

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

class MissingTopicsErrorMock extends Error {
  readonly missing: string[];
  readonly code = "interview_checklist_incomplete";
  constructor(missing: string[]) {
    super("interview_checklist_incomplete");
    this.name = "MissingTopicsError";
    this.missing = missing;
  }
}

class SummaryGenerationFailedErrorMock extends Error {
  readonly code = "summary_generation_failed";
  constructor(message: string) {
    super(message);
    this.name = "SummaryGenerationFailedError";
  }
}

vi.mock("../../../../features/ai/ai.interview.service.js", () => ({
  getInterviewContext: (...args: unknown[]) => mockGetInterviewContext(...args),
  runInterviewTurn: (...args: unknown[]) => mockRunInterviewTurn(...args),
  runInterviewComplete: (...args: unknown[]) =>
    mockRunInterviewComplete(...args),
  runGenerateSummary: (...args: unknown[]) => mockRunGenerateSummary(...args),
}));

vi.mock("../../../../features/ai/ai.errors.js", () => ({
  TurnConflictError: TurnConflictErrorMock,
  MissingTopicsError: MissingTopicsErrorMock,
  SummaryGenerationFailedError: SummaryGenerationFailedErrorMock,
  AIProviderError: class AIProviderError extends Error {},
  AITimeoutError: class AITimeoutError extends Error {},
  AIRateLimitError: class AIRateLimitError extends Error {},
  AIContentSafetyError: class AIContentSafetyError extends Error {},
}));

vi.mock("../../../../features/ai/ai.groqProvider.js", () => ({
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
  userRows.length = 0;
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

  it("returns completed metadata when status is completed", async () => {
    userRows.push({ name: "Jane Admin" });
    mockGetInterviewContext.mockResolvedValue({
      status: "completed",
      summaryStatus: "ready",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Done!" }],
      contextSummary: "# Summary\n\nAll good.",
      completedBy: USER_ID,
      completedAt: "2026-05-29T12:00:00.000Z",
    });
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "completed",
      summaryStatus: "ready",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Done!" }],
      contextSummary: "# Summary\n\nAll good.",
      completedBy: USER_ID,
      completedByName: "Jane Admin",
      completedAt: "2026-05-29T12:00:00.000Z",
    });
  });

  it("includes summaryStatus=pending when completed without summary yet", async () => {
    userRows.push({ name: "Jane Admin" });
    mockGetInterviewContext.mockResolvedValue({
      status: "completed",
      summaryStatus: "pending",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Done!" }],
      contextSummary: null,
      completedBy: USER_ID,
      completedAt: "2026-05-29T12:00:00.000Z",
    });
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    const body = await res.json();
    expect(body.summaryStatus).toBe("pending");
    expect(body.contextSummary).toBeNull();
  });

  it("includes summaryStatus=failed when summary generation failed", async () => {
    userRows.push({ name: "Jane Admin" });
    mockGetInterviewContext.mockResolvedValue({
      status: "completed",
      summaryStatus: "failed",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Done!" }],
      contextSummary: "# Stale Summary",
      completedBy: USER_ID,
      completedAt: "2026-05-29T12:00:00.000Z",
    });
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    const body = await res.json();
    expect(body.summaryStatus).toBe("failed");
    expect(body.contextSummary).toBe("# Stale Summary");
  });

  it("omits completed metadata when status is in_progress", async () => {
    mockGetInterviewContext.mockResolvedValue({
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 3,
      interviewLog: [{ role: "assistant", content: "Q?" }],
      contextSummary: null,
      completedBy: null,
      completedAt: null,
    });
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 3,
      interviewLog: [{ role: "assistant", content: "Q?" }],
    });
    expect(body).not.toHaveProperty("contextSummary");
    expect(body).not.toHaveProperty("completedBy");
    expect(body).not.toHaveProperty("completedAt");
  });

  it("returns persisted state when row exists", async () => {
    mockGetInterviewContext.mockResolvedValue({
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "Hi!" }],
    });
    const res = await buildApp().request(`/applications/${APP_ID}/ai-interview`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "in_progress",
      summaryStatus: "none",
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
    mockRunInterviewTurn.mockResolvedValue({
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

    expect(mockRunInterviewTurn).toHaveBeenCalledWith({
      provider: expect.any(Object),
      applicationId: APP_ID,
      tenantId: ORG_ID,
      userId: USER_ID,
      message: "",
      expectedCurrentTurn: 0,
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
    mockRunInterviewTurn.mockResolvedValue({
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
    expect(mockRunInterviewTurn).toHaveBeenCalledWith({
      provider: expect.any(Object),
      applicationId: APP_ID,
      tenantId: ORG_ID,
      userId: USER_ID,
      message: "We sell books online.",
      expectedCurrentTurn: 0,
    });
  });

  it("redirect_scope guardrail leaves currentTurn unchanged and surfaces guardrailAction", async () => {
    mockRunInterviewTurn.mockResolvedValue({
      row: {
        status: "in_progress",
        currentTurn: 2,
        interviewLog: [
          { role: "assistant", content: "q" },
          { role: "user", content: "off-topic question" },
          { role: "assistant", content: "Let's stay focused." },
        ],
      },
      output: {
        assistantMessage: "Let's stay focused.",
        intent: "ask",
        topicsCoveredThisTurn: [],
        guardrailAction: "redirect_scope",
      },
    });

    const res = await postAnswer({
      message: "what about the weather?",
      expectedCurrentTurn: 2,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentTurn).toBe(2);
    expect(body.turn.guardrailAction).toBe("redirect_scope");
  });

  it("pushback_garbage guardrail advances currentTurn and reports the action", async () => {
    mockRunInterviewTurn.mockResolvedValue({
      row: {
        status: "in_progress",
        currentTurn: 3,
        interviewLog: [
          { role: "assistant", content: "q" },
          {
            role: "user",
            content: "asdf",
            garbagePushbackTopics: ["target_audience"],
          },
          { role: "assistant", content: "Could you elaborate?" },
        ],
      },
      output: {
        assistantMessage: "Could you elaborate?",
        intent: "ask",
        topicsCoveredThisTurn: ["target_audience"],
        guardrailAction: "pushback_garbage",
      },
    });

    const res = await postAnswer({ message: "asdf", expectedCurrentTurn: 2 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentTurn).toBe(3);
    expect(body.turn.guardrailAction).toBe("pushback_garbage");
  });

  it("returns 409 turn_conflict on stale expectedCurrentTurn", async () => {
    mockRunInterviewTurn.mockRejectedValue(
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
    mockRunInterviewTurn.mockRejectedValue(
      new TurnConflictErrorMock(7, "completed"),
    );

    const res = await postAnswer({ message: "answer", expectedCurrentTurn: 7 });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.status).toBe("completed");
  });

  it("LLM provider failure flows through ai.errorMapper (no partial state)", async () => {
    const providerError = new Error("provider down");
    mockRunInterviewTurn.mockRejectedValue(providerError);
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
    expect(mockRunInterviewTurn).toHaveBeenCalledOnce();
  });

  it("retrying after a transient failure with the same expectedCurrentTurn succeeds", async () => {
    mockRunInterviewTurn
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

describe("POST /applications/:applicationId/ai-interview/complete", () => {
  async function postComplete(
    body: Record<string, unknown>,
    appId = APP_ID,
  ) {
    return buildApp().request(
      `/applications/${appId}/ai-interview/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuthContext = null;
    expect((await postComplete({ expectedCurrentTurn: 5 })).status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuthContext = operatorAuth();
    expect((await postComplete({ expectedCurrentTurn: 5 })).status).toBe(403);
  });

  it("returns 402 when billing is not allowed", async () => {
    billingAllowed = false;
    expect((await postComplete({ expectedCurrentTurn: 5 })).status).toBe(402);
  });

  it("returns 403 when AI feature is not available", async () => {
    aiFeatureAllowed = false;
    expect((await postComplete({ expectedCurrentTurn: 5 })).status).toBe(403);
  });

  it("returns 404 for cross-tenant application", async () => {
    ownedApplicationRows.length = 0;
    expect(
      (await postComplete({ expectedCurrentTurn: 5 }, OTHER_APP_ID)).status,
    ).toBe(404);
  });

  it("happy path: returns completed state with summaryStatus=pending", async () => {
    mockRunInterviewComplete.mockResolvedValue({
      row: {
        status: "completed",
        summaryStatus: "pending",
        currentTurn: 6,
        completedBy: USER_ID,
        completedAt: "2026-05-29T10:00:00.000Z",
      },
    });

    const res = await postComplete({ expectedCurrentTurn: 6 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "completed",
      summaryStatus: "pending",
      currentTurn: 6,
      completedBy: USER_ID,
      completedAt: "2026-05-29T10:00:00.000Z",
    });
    expect(mockRunInterviewComplete).toHaveBeenCalledWith({
      applicationId: APP_ID,
      userId: USER_ID,
      expectedCurrentTurn: 6,
    });
  });

  it("is idempotent on second call: returns existing summaryStatus unchanged", async () => {
    mockRunInterviewComplete.mockResolvedValue({
      row: {
        status: "completed",
        summaryStatus: "ready",
        currentTurn: 6,
        completedBy: USER_ID,
        completedAt: "2026-05-29T10:00:00.000Z",
      },
    });

    const res = await postComplete({ expectedCurrentTurn: 6 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summaryStatus).toBe("ready");
  });

  it("returns 422 with discriminable error code when checklist is incomplete", async () => {
    mockRunInterviewComplete.mockRejectedValue(
      new MissingTopicsErrorMock(["target_audience", "prohibited_topics"]),
    );

    const res = await postComplete({ expectedCurrentTurn: 3 });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: "interview_checklist_incomplete",
      missing: ["target_audience", "prohibited_topics"],
    });
  });

  it("returns 409 turn_conflict on optimistic-lock mismatch", async () => {
    mockRunInterviewComplete.mockRejectedValue(
      new TurnConflictErrorMock(4, "in_progress"),
    );

    const res = await postComplete({ expectedCurrentTurn: 2 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: "turn_conflict",
      currentTurn: 4,
      status: "in_progress",
    });
  });

  it("returns 409 turn_conflict when already completed", async () => {
    mockRunInterviewComplete.mockRejectedValue(
      new TurnConflictErrorMock(7, "completed"),
    );

    const res = await postComplete({ expectedCurrentTurn: 7 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.status).toBe("completed");
  });
});

describe("POST /applications/:applicationId/ai-interview/generate-summary", () => {
  async function postGenerate(appId = APP_ID) {
    return buildApp().request(
      `/applications/${appId}/ai-interview/generate-summary`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuthContext = null;
    expect((await postGenerate()).status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuthContext = operatorAuth();
    expect((await postGenerate()).status).toBe(403);
  });

  it("returns 402 when billing is not allowed", async () => {
    billingAllowed = false;
    expect((await postGenerate()).status).toBe(402);
  });

  it("returns 403 when AI feature is not available", async () => {
    aiFeatureAllowed = false;
    expect((await postGenerate()).status).toBe(403);
  });

  it("returns 404 for cross-tenant application", async () => {
    ownedApplicationRows.length = 0;
    expect((await postGenerate(OTHER_APP_ID)).status).toBe(404);
  });

  it("happy path: returns persisted summary, summaryStatus=ready, aiEnabled=true", async () => {
    mockRunGenerateSummary.mockResolvedValue({
      row: {
        status: "completed",
        summaryStatus: "ready",
        contextSummary: "# Application Context\n...",
      },
    });

    const res = await postGenerate();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "completed",
      summaryStatus: "ready",
      contextSummary: "# Application Context\n...",
      aiEnabled: true,
    });
    expect(mockRunGenerateSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APP_ID,
        tenantId: ORG_ID,
        userId: USER_ID,
      }),
    );
  });

  it("returns 422 summary_generation_failed when generator fails", async () => {
    mockRunGenerateSummary.mockRejectedValue(
      new SummaryGenerationFailedErrorMock("provider boom"),
    );

    const res = await postGenerate();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("summary_generation_failed");
  });
});
