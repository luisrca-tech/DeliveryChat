import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// `ai.middleware` → `entitlement` → `env`; stub env so importing the middleware
// doesn't require the full validated environment.
vi.mock("../../../env.js", () => ({
  env: { STRIPE_AI_ADDON_PRICE_KEY: "price_ai_addon" },
}));

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../../../lib/middleware/auth.js", () => ({
  getTenantAuth: vi.fn(),
}));

const { db } = await import("../../../db/index.js");
const { getTenantAuth } = await import("../../../lib/middleware/auth.js");
const mockGetTenantAuth = getTenantAuth as ReturnType<typeof vi.fn>;
const mockSelect = db.select as ReturnType<typeof vi.fn>;

function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit"];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const {
  requireAiFeature,
  createAiRateLimitMiddleware,
  QUOTA_EXCLUDED_ACTIONS,
} = await import("../ai.middleware.js");
const { InMemoryRateLimitStore } = await import("../ai.rateLimit.js");

const FUTURE_TRIAL = new Date(Date.now() + 86_400_000).toISOString();
const PAST_TRIAL = new Date(Date.now() - 86_400_000).toISOString();

function createMemberAuth(
  plan: string,
  organizationId = "org-1",
  billing: { planStatus?: string | null; trialEndsAt?: string | null } = {},
) {
  return {
    type: "member" as const,
    organization: {
      id: organizationId,
      plan,
      name: "Test Org",
      planStatus: billing.planStatus ?? "active",
      trialEndsAt: billing.trialEndsAt ?? null,
    },
    membership: {
      role: "operator",
      userId: "user-1",
      id: "m-1",
      organizationId,
    },
    user: { id: "user-1", name: "Test User" },
    session: {},
  };
}

/** Mounts `requireAiFeature(feature)` behind an auth stub and returns the app. */
function createGatedApp(
  auth: ReturnType<typeof createMemberAuth>,
  feature?: "reply" | "interview",
) {
  mockGetTenantAuth.mockReturnValue(auth);
  const app = new Hono();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use("*", (c: any, next) => {
    c.set("auth", auth);
    return next();
  });
  app.use("*", requireAiFeature(feature));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("requireAiFeature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows PREMIUM plan tenants through", async () => {
    mockSelect.mockReturnValue(chainMock([]));

    const res = await createGatedApp(createMemberAuth("PREMIUM")).request(
      "/test",
    );
    expect(res.status).toBe(200);
  });

  it("blocks FREE plan tenants with 403", async () => {
    const res = await createGatedApp(createMemberAuth("FREE")).request("/test");

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_feature_not_available");
  });

  it("allows BASIC plan tenants through", async () => {
    mockSelect.mockReturnValue(chainMock([]));

    const res = await createGatedApp(createMemberAuth("BASIC")).request(
      "/test",
    );
    expect(res.status).toBe(200);
  });

  it("blocks BASIC once its 1000-call monthly cap is reached", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock([]))
      .mockReturnValueOnce(chainMock([{ count: 1000 }]));

    const res = await createGatedApp(createMemberAuth("BASIC")).request(
      "/test",
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_monthly_cap_exceeded");
  });

  it("blocks when monthly cap is exceeded", async () => {
    mockSelect.mockReturnValue(chainMock([{ count: 3000 }]));

    const res = await createGatedApp(createMemberAuth("PREMIUM")).request(
      "/test",
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_monthly_cap_exceeded");
  });

  it("excludes interview actions from quota count", () => {
    expect(QUOTA_EXCLUDED_ACTIONS).toBeDefined();
    expect(QUOTA_EXCLUDED_ACTIONS).toContain("interview");
    expect(QUOTA_EXCLUDED_ACTIONS).toContain("interview_summary");
  });

  it("uses aiMonthlyCapOverride for ENTERPRISE tenants", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock([{ aiMonthlyCapOverride: 5000 }]))
      .mockReturnValueOnce(chainMock([{ count: 4999 }]));

    const res = await createGatedApp(createMemberAuth("ENTERPRISE")).request(
      "/test",
    );
    expect(res.status).toBe(200);
  });
});

describe('requireAiFeature("interview")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a FREE tenant interview while its 14-day trial is running", async () => {
    const auth = createMemberAuth("FREE", "org-1", {
      planStatus: "trialing",
      trialEndsAt: FUTURE_TRIAL,
    });

    const res = await createGatedApp(auth, "interview").request("/test");
    expect(res.status).toBe(200);
  });

  it("blocks a FREE tenant whose trial has expired", async () => {
    const auth = createMemberAuth("FREE", "org-1", {
      planStatus: "trialing",
      trialEndsAt: PAST_TRIAL,
    });

    const res = await createGatedApp(auth, "interview").request("/test");

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_interview_trial_expired");
  });

  it("blocks a FREE tenant that has no trial at all", async () => {
    const auth = createMemberAuth("FREE", "org-1", {
      planStatus: null,
      trialEndsAt: null,
    });

    const res = await createGatedApp(auth, "interview").request("/test");

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_interview_trial_expired");
  });

  it("lets BASIC interview", async () => {
    const res = await createGatedApp(
      createMemberAuth("BASIC"),
      "interview",
    ).request("/test");
    expect(res.status).toBe(200);
  });

  it("never charges the interview gate against the monthly cap", async () => {
    // A PREMIUM tenant sitting at its cap may still finish onboarding.
    mockSelect.mockReturnValue(chainMock([{ count: 3000 }]));

    const res = await createGatedApp(
      createMemberAuth("PREMIUM"),
      "interview",
    ).request("/test");
    expect(res.status).toBe(200);
  });
});

describe("createAiRateLimitMiddleware - lazy cleanup", () => {
  let store: InstanceType<typeof InMemoryRateLimitStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new InMemoryRateLimitStore([
      { windowMs: 60_000, maxRequests: 10 },
      { windowMs: 86_400_000, maxRequests: 250 },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetTenantAuth.mockImplementation((c: any) => c.get("auth"));
  });

  function createRateLimitApp(tenantId = "org-1") {
    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", (c: any, next) => {
      c.set("auth", createMemberAuth("PREMIUM", tenantId));
      return next();
    });
    app.use("*", createAiRateLimitMiddleware(store));
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("resets counts after window expiration", async () => {
    vi.useFakeTimers();
    const now = Date.now();

    const app = createRateLimitApp("org-expired");
    for (let i = 0; i < 10; i++) {
      await app.request("/test");
    }

    const blocked = await app.request("/test");
    expect(blocked.status).toBe(429);

    vi.setSystemTime(now + 61_000);
    const res = await app.request("/test");
    expect(res.status).toBe(200);

    vi.useRealTimers();
  });

  it("uses in-memory store by default (no setInterval)", () => {
    expect(store).toBeInstanceOf(InMemoryRateLimitStore);
  });
});

describe("createAiRateLimitMiddleware - enforcement and tenant isolation", () => {
  let store: InstanceType<typeof InMemoryRateLimitStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new InMemoryRateLimitStore([
      { windowMs: 60_000, maxRequests: 10 },
      { windowMs: 86_400_000, maxRequests: 250 },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetTenantAuth.mockImplementation((c: any) => c.get("auth"));
  });

  function createRateLimitApp(tenantId = "org-1") {
    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", (c: any, next) => {
      c.set("auth", createMemberAuth("PREMIUM", tenantId));
      return next();
    });
    app.use("*", createAiRateLimitMiddleware(store));
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows 10 requests within the per-minute window", async () => {
    const app = createRateLimitApp("org-burst");

    for (let i = 0; i < 10; i++) {
      const res = await app.request("/test");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 on the 11th request from the same tenant", async () => {
    const app = createRateLimitApp("org-limited");

    for (let i = 0; i < 10; i++) {
      await app.request("/test");
    }

    const res = await app.request("/test");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("ai_rate_limit_exceeded");
  });

  it("includes Retry-After header on 429 response", async () => {
    const app = createRateLimitApp("org-retry");

    for (let i = 0; i < 10; i++) {
      await app.request("/test");
    }

    const res = await app.request("/test");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("does not affect a different tenant (tenant isolation)", async () => {
    const appA = createRateLimitApp("org-A");
    const appB = createRateLimitApp("org-B");

    for (let i = 0; i < 10; i++) {
      await appA.request("/test");
    }

    const resA = await appA.request("/test");
    expect(resA.status).toBe(429);

    const resB = await appB.request("/test");
    expect(resB.status).toBe(200);
  });
});
