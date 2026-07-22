import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// `ai.middleware` transitively imports `ai.quota` → `db/index.js`; stub the db
// so importing the middleware doesn't touch a real database connection.
vi.mock("../../../db/index.js", () => ({
  db: { select: vi.fn() },
}));

// `ai.middleware` → `entitlement` → `env`; stub env so importing the middleware
// doesn't require the full validated environment.
vi.mock("../../../env.js", () => ({
  env: { STRIPE_AI_ADDON_PRICE_KEY: "price_ai_addon" },
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
// data-tools routes, which no longer carry an ENTERPRISE-custom distinction. It
// delegates the plan × aiAddonActive rule to `isAddonEntitled` (proven
// exhaustively in `entitlement.test.ts`), so this suite only asserts the
// middleware wiring: entitled → pass, not entitled → the 403 error contract.
describe("requireAiAddon (also gates data-tools)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes through when the org is entitled", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("PREMIUM", true));
    const res = await buildApp(requireAiAddon()).request("/test");
    expect(res.status).toBe(200);
  });

  it("returns 403 ai_addon_not_active when the org is not entitled", async () => {
    mockGetTenantAuth.mockReturnValue(makeAuth("PREMIUM", false));
    const res = await buildApp(requireAiAddon()).request("/test");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ai_addon_not_active");
  });
});
