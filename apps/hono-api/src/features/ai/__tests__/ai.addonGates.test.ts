import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// `ai.middleware` transitively imports `ai.quota` → `db/index.js`; stub the db
// so importing the middleware doesn't touch a real database connection.
vi.mock("../../../db/index.js", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../../../lib/middleware/auth.js", () => ({
  getTenantAuth: vi.fn(),
}));

const { getTenantAuth } = await import("../../../lib/middleware/auth.js");
const mockGetTenantAuth = getTenantAuth as ReturnType<typeof vi.fn>;

const { requireAiAddon } = await import("../ai.middleware.js");

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

// `requireAiAddon` is the single gate for the whole AI feature — including the
// data-tools routes, which no longer carry an ENTERPRISE-custom distinction.
describe("requireAiAddon (also gates data-tools)", () => {
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

  it("blocks ENTERPRISE when add-on is inactive", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("ENTERPRISE", false));
    const res = await buildApp(requireAiAddon()).request("/test");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ai_addon_not_active");
  });
});
