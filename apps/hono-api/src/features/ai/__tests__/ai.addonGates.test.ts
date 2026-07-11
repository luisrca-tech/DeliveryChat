import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../../db/index.js", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../../../db/schema/tenantRateLimits.js", () => ({
  tenantRateLimits: { tenantId: "tenant_id", isCustom: "is_custom" },
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
  for (const method of ["from", "where", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const { requireAiAddon, requireAiDbFeature } = await import(
  "../ai.middleware.js"
);

function makeAuth(
  plan: string,
  aiAddonActive: boolean,
  organizationId = "org-1",
) {
  return {
    organization: { id: organizationId, plan, aiAddonActive },
    membership: { role: "operator" },
    user: { id: "user-1" },
    session: {},
  };
}

function buildApp(middleware: ReturnType<typeof requireAiAddon>) {
  const app = new Hono();
  app.use("*", middleware);
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("requireAiAddon", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows PREMIUM + add-on active", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("PREMIUM", true));
    const res = await buildApp(requireAiAddon()).request("/test");
    expect(res.status).toBe(200);
  });

  it("allows ENTERPRISE + add-on active", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("ENTERPRISE", true));
    const res = await buildApp(requireAiAddon()).request("/test");
    expect(res.status).toBe(200);
  });

  it("blocks BASIC even with add-on active", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("BASIC", true));
    const res = await buildApp(requireAiAddon()).request("/test");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ai_addon_not_active");
  });

  it("blocks PREMIUM when add-on is inactive", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("PREMIUM", false));
    const res = await buildApp(requireAiAddon()).request("/test");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ai_addon_not_active");
  });
});

describe("requireAiDbFeature", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows ENTERPRISE + add-on active + custom limits", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("ENTERPRISE", true));
    mockSelect.mockReturnValue(chainMock([{ isCustom: true }]));
    const res = await buildApp(requireAiDbFeature()).request("/test");
    expect(res.status).toBe(200);
  });

  it("blocks ENTERPRISE + add-on active but non-custom limits", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("ENTERPRISE", true));
    mockSelect.mockReturnValue(chainMock([{ isCustom: false }]));
    const res = await buildApp(requireAiDbFeature()).request("/test");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ai_db_feature_not_available");
  });

  it("blocks ENTERPRISE + add-on active with no rate-limit row", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("ENTERPRISE", true));
    mockSelect.mockReturnValue(chainMock([]));
    const res = await buildApp(requireAiDbFeature()).request("/test");
    expect(res.status).toBe(403);
  });

  it("blocks PREMIUM even with custom limits (not ENTERPRISE)", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("PREMIUM", true));
    mockSelect.mockReturnValue(chainMock([{ isCustom: true }]));
    const res = await buildApp(requireAiDbFeature()).request("/test");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ai_db_feature_not_available");
  });

  it("blocks ENTERPRISE when add-on is inactive", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("ENTERPRISE", false));
    mockSelect.mockReturnValue(chainMock([{ isCustom: true }]));
    const res = await buildApp(requireAiDbFeature()).request("/test");
    expect(res.status).toBe(403);
  });
});
