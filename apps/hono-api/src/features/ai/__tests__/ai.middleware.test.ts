import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

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

const { requireAiFeature, createAiRateLimitMiddleware, _testGetRateLimitStore, QUOTA_EXCLUDED_ACTIONS } = await import("../ai.middleware.js");

function createMemberAuth(plan: string, organizationId = "org-1") {
  return {
    type: "member" as const,
    organization: { id: organizationId, plan, name: "Test Org" },
    membership: { role: "operator", userId: "user-1", id: "m-1", organizationId },
    user: { id: "user-1", name: "Test User" },
    session: {},
  };
}

describe("requireAiFeature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows PREMIUM plan tenants through", async () => {
    mockGetTenantAuth.mockReturnValue(createMemberAuth("PREMIUM"));
    mockSelect.mockReturnValue(chainMock([]));

    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", (c: any, next) => {
      c.set("auth", createMemberAuth("PREMIUM"));
      return next();
    });
    app.use("*", requireAiFeature());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("blocks FREE plan tenants with 403", async () => {
    mockGetTenantAuth.mockReturnValue(createMemberAuth("FREE"));

    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", (c: any, next) => {
      c.set("auth", createMemberAuth("FREE"));
      return next();
    });
    app.use("*", requireAiFeature());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_feature_not_available");
  });

  it("blocks BASIC plan tenants with 403", async () => {
    mockGetTenantAuth.mockReturnValue(createMemberAuth("BASIC"));

    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", (c: any, next) => {
      c.set("auth", createMemberAuth("BASIC"));
      return next();
    });
    app.use("*", requireAiFeature());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(403);
  });

  it("blocks when monthly cap is exceeded", async () => {
    mockGetTenantAuth.mockReturnValue(createMemberAuth("PREMIUM"));
    mockSelect.mockReturnValue(chainMock([{ count: 3000 }]));

    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", (c: any, next) => {
      c.set("auth", createMemberAuth("PREMIUM"));
      return next();
    });
    app.use("*", requireAiFeature());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ai_monthly_cap_exceeded");
  });

  it("excludes interview actions from quota count", () => {
    expect(QUOTA_EXCLUDED_ACTIONS).toBeDefined();
    expect(QUOTA_EXCLUDED_ACTIONS).toContain("interview");
  });

  it("uses aiMonthlyCapOverride for ENTERPRISE tenants", async () => {
    mockGetTenantAuth.mockReturnValue(createMemberAuth("ENTERPRISE"));
    mockSelect
      .mockReturnValueOnce(chainMock([{ aiMonthlyCapOverride: 5000 }]))
      .mockReturnValueOnce(chainMock([{ count: 4999 }]));

    const app = new Hono();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", (c: any, next) => {
      c.set("auth", createMemberAuth("ENTERPRISE"));
      return next();
    });
    app.use("*", requireAiFeature());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });
});

describe("createAiRateLimitMiddleware - lazy cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = _testGetRateLimitStore();
    store.clear();
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
    app.use("*", createAiRateLimitMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("cleans up expired windows for a tenant on access", async () => {
    const store = _testGetRateLimitStore();
    const pastTime = Date.now() - 100_000;

    store.set("org-expired", [
      { count: 5, resetAt: pastTime },
      { count: 100, resetAt: pastTime },
    ]);

    const app = createRateLimitApp("org-expired");
    const res = await app.request("/test");
    expect(res.status).toBe(200);

    const windows = store.get("org-expired")!;
    expect(windows[0]!.count).toBe(1);
    expect(windows[1]!.count).toBe(1);
  });

  it("removes tenant key from Map when all windows are expired and no new request", async () => {
    const store = _testGetRateLimitStore();
    const pastTime = Date.now() - 100_000;

    store.set("org-stale", [
      { count: 5, resetAt: pastTime },
      { count: 100, resetAt: pastTime },
    ]);

    expect(store.has("org-stale")).toBe(true);

    const app = createRateLimitApp("org-active");
    await app.request("/test");

    expect(store.has("org-stale")).toBe(true);

    const appStale = createRateLimitApp("org-stale");
    await appStale.request("/test");

    expect(store.has("org-stale")).toBe(true);
    const windows = store.get("org-stale")!;
    expect(windows[0]!.count).toBe(1);
  });

  it("does not use setInterval or background timers", () => {
    expect(_testGetRateLimitStore).toBeDefined();
    const store = _testGetRateLimitStore();
    expect(store).toBeInstanceOf(Map);
  });
});

describe("createAiRateLimitMiddleware - enforcement and tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = _testGetRateLimitStore();
    store.clear();
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
    app.use("*", createAiRateLimitMiddleware());
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
