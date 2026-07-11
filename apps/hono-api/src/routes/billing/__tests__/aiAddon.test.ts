import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mutable auth context, swapped per test.
type TestAuth = {
  user: { id: string };
  organization: Record<string, unknown>;
  membership: { role: string };
};

let currentAuth: TestAuth;

vi.mock("../../../lib/middleware/auth.js", () => ({
  getTenantAuth: () => currentAuth,
  // Faithful rank-based reimplementation so the "wrong role" precondition is
  // actually exercised (the real chain pulls in better-auth + db at import).
  requireRole:
    (minRole: string) =>
    async (
      c: { json: (b: unknown, s: number) => Response },
      next: () => Promise<void>,
    ) => {
      const rank: Record<string, number> = {
        operator: 1,
        admin: 2,
        super_admin: 3,
      };
      if (
        (rank[currentAuth.membership.role] ?? 0) < (rank[minRole] ?? 0)
      ) {
        return c.json(
          { error: "forbidden", message: "Insufficient role" },
          403,
        );
      }
      await next();
    },
}));

vi.mock("../../../env.js", () => ({
  env: { STRIPE_AI_ADDON_PRICE_KEY: "price_ai_addon" },
}));

const mockCreate = vi.fn();
const mockDel = vi.fn();
vi.mock("../../../lib/stripe.js", () => ({
  stripe: {
    subscriptionItems: {
      create: (...args: unknown[]) => mockCreate(...args),
      del: (...args: unknown[]) => mockDel(...args),
    },
  },
}));

const { aiAddonRoute } = await import("../aiAddon.js");
const app = new Hono().route("/billing", aiAddonRoute);

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    plan: "PREMIUM",
    planStatus: "active",
    stripeSubscriptionId: "sub_123",
    aiAddonActive: false,
    aiAddonSubscriptionItemId: null,
    ...overrides,
  };
}

function setAuth(org: Record<string, unknown>, role = "super_admin") {
  currentAuth = {
    user: { id: "user-1" },
    organization: org,
    membership: { role },
  };
}

function postAddon() {
  return app.request("/billing/ai-addon", { method: "POST" });
}
function deleteAddon() {
  return app.request("/billing/ai-addon", { method: "DELETE" });
}

describe("POST /billing/ai-addon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "si_addon" });
  });

  it("adds the add-on subscription item on the happy path", async () => {
    setAuth(makeOrg());

    const res = await postAddon();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending");

    expect(mockCreate).toHaveBeenCalledWith({
      subscription: "sub_123",
      price: "price_ai_addon",
      quantity: 1,
    });
  });

  it("allows ENTERPRISE plans", async () => {
    setAuth(makeOrg({ plan: "ENTERPRISE" }));
    const res = await postAddon();
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
  });

  it("rejects when there is no active subscription", async () => {
    setAuth(makeOrg({ stripeSubscriptionId: null }));
    const res = await postAddon();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_active_subscription");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when the plan status is not active/trialing", async () => {
    setAuth(makeOrg({ planStatus: "canceled" }));
    const res = await postAddon();
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("subscription_not_active");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when the plan is not eligible", async () => {
    setAuth(makeOrg({ plan: "BASIC" }));
    const res = await postAddon();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("plan_not_eligible");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when the add-on is already active", async () => {
    setAuth(makeOrg({ aiAddonActive: true }));
    const res = await postAddon();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("ai_addon_already_active");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-super_admin role", async () => {
    setAuth(makeOrg(), "operator");
    const res = await postAddon();
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("DELETE /billing/ai-addon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDel.mockResolvedValue({ id: "si_addon", deleted: true });
  });

  it("removes the add-on item with proration on the happy path", async () => {
    setAuth(
      makeOrg({ aiAddonActive: true, aiAddonSubscriptionItemId: "si_addon" }),
    );

    const res = await deleteAddon();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pending");

    expect(mockDel).toHaveBeenCalledWith(
      "si_addon",
      expect.objectContaining({ proration_behavior: "create_prorations" }),
    );
  });

  it("rejects when there is no add-on item to cancel", async () => {
    setAuth(makeOrg({ aiAddonSubscriptionItemId: null }));
    const res = await deleteAddon();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("ai_addon_not_active");
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("rejects a non-super_admin role", async () => {
    setAuth(
      makeOrg({ aiAddonActive: true, aiAddonSubscriptionItemId: "si_addon" }),
      "operator",
    );
    const res = await deleteAddon();
    expect(res.status).toBe(403);
    expect(mockDel).not.toHaveBeenCalled();
  });
});
