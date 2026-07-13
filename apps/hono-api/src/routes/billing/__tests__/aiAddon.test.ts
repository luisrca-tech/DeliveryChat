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
const mockSubRetrieve = vi.fn();
const mockCreatePreview = vi.fn();
const mockPriceRetrieve = vi.fn();
vi.mock("../../../lib/stripe.js", () => ({
  stripe: {
    subscriptionItems: {
      create: (...args: unknown[]) => mockCreate(...args),
      del: (...args: unknown[]) => mockDel(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubRetrieve(...args),
    },
    invoices: {
      createPreview: (...args: unknown[]) => mockCreatePreview(...args),
    },
    prices: {
      retrieve: (...args: unknown[]) => mockPriceRetrieve(...args),
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
function previewAddon() {
  return app.request("/billing/ai-addon/preview", { method: "GET" });
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

describe("GET /billing/ai-addon/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // current_period_end = 2026-03-07T00:00:00Z
    const periodEnd = Math.floor(Date.UTC(2026, 2, 7) / 1000);
    mockSubRetrieve.mockResolvedValue({
      id: "sub_123",
      currency: "brl",
      current_period_end: periodEnd,
      items: { data: [{ id: "si_plan" }] },
    });
    mockCreatePreview.mockResolvedValue({
      currency: "brl",
      lines: {
        data: [
          { proration: true, amount: 8000 },
          { proration: true, amount: -1000 },
          { proration: false, amount: 12000 },
        ],
      },
    });
    mockPriceRetrieve.mockResolvedValue({
      currency: "usd",
      unit_amount: 4900,
      currency_options: { brl: { unit_amount: 12000 } },
    });
  });

  it("returns the proration, recurring amount, currency and next billing date", async () => {
    setAuth(makeOrg());

    const res = await previewAddon();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.currency).toBe("brl");
    // 8000 - 1000 (only proration=true lines)
    expect(body.prorationAmount).toBe(7000);
    // add-on price unit_amount for the subscription currency (brl)
    expect(body.recurringAmount).toBe(12000);
    expect(body.nextBillingDate).toBe("2026-03-07T00:00:00.000Z");

    expect(mockCreatePreview).toHaveBeenCalledWith({
      subscription: "sub_123",
      subscription_details: {
        items: [{ id: "si_plan" }, { price: "price_ai_addon" }],
        proration_behavior: "create_prorations",
      },
    });
  });

  it("falls back to the base unit_amount when no currency option matches", async () => {
    setAuth(makeOrg());
    mockSubRetrieve.mockResolvedValue({
      id: "sub_123",
      currency: "eur",
      current_period_end: Math.floor(Date.UTC(2026, 2, 7) / 1000),
      items: { data: [{ id: "si_plan" }] },
    });
    mockPriceRetrieve.mockResolvedValue({
      currency: "usd",
      unit_amount: 4900,
      currency_options: { brl: { unit_amount: 12000 } },
    });

    const res = await previewAddon();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recurringAmount).toBe(4900);
  });

  it("rejects when there is no active subscription", async () => {
    setAuth(makeOrg({ stripeSubscriptionId: null }));
    const res = await previewAddon();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_active_subscription");
    expect(mockCreatePreview).not.toHaveBeenCalled();
  });

  it("rejects when the plan status is not active/trialing", async () => {
    setAuth(makeOrg({ planStatus: "canceled" }));
    const res = await previewAddon();
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("subscription_not_active");
    expect(mockCreatePreview).not.toHaveBeenCalled();
  });

  it("rejects when the plan is not eligible", async () => {
    setAuth(makeOrg({ plan: "BASIC" }));
    const res = await previewAddon();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("plan_not_eligible");
    expect(mockCreatePreview).not.toHaveBeenCalled();
  });

  it("rejects when the add-on is already active", async () => {
    setAuth(makeOrg({ aiAddonActive: true }));
    const res = await previewAddon();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("ai_addon_already_active");
    expect(mockCreatePreview).not.toHaveBeenCalled();
  });

  it("rejects a non-super_admin role", async () => {
    setAuth(makeOrg(), "operator");
    const res = await previewAddon();
    expect(res.status).toBe(403);
    expect(mockCreatePreview).not.toHaveBeenCalled();
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
