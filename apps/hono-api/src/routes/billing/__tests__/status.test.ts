import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

type TestAuth = {
  user: { id: string };
  organization: Record<string, unknown>;
  membership: { role: string };
};

let currentAuth: TestAuth;

vi.mock("../../../lib/middleware/auth.js", () => ({
  getTenantAuth: () => currentAuth,
}));

vi.mock("../../../env.js", () => ({
  env: {
    STRIPE_AI_ADDON_PRICE_KEY: "price_ai_addon",
    STRIPE_BASIC_PRICE_KEY: "price_basic",
    STRIPE_PREMIUM_PRICE_KEY: "price_premium",
    STRIPE_ENTERPRISE_PRODUCT_KEY: "prod_enterprise",
  },
}));

const mockSubRetrieve = vi.fn();
vi.mock("../../../lib/stripe.js", () => ({
  stripe: {
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubRetrieve(...args),
    },
  },
}));

const mockUpdateSet = vi.fn();
vi.mock("../../../db/index.js", () => ({
  db: {
    update: () => ({
      set: (...args: unknown[]) => {
        mockUpdateSet(...args);
        return { where: () => Promise.resolve([]) };
      },
    }),
  },
}));

vi.mock("../../../db/schema/organization.js", () => ({
  organization: { id: "id" },
}));

const { statusRoute } = await import("../status.js");
const app = new Hono().route("/billing", statusRoute);

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    plan: "BASIC",
    planStatus: "active",
    stripeSubscriptionId: "sub_123",
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    aiAddonActive: false,
    ...overrides,
  };
}

function setAuth(org: Record<string, unknown>) {
  currentAuth = {
    user: { id: "user-1" },
    organization: org,
    membership: { role: "super_admin" },
  };
}

function subscriptionWithPrice(priceId: string) {
  return {
    id: "sub_123",
    metadata: { plan: "BASIC" },
    items: { data: [{ id: "si_1", price: { id: priceId, lookup_key: null } }] },
  };
}

describe("GET /billing/status — plan reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists and serves the live Stripe plan when the stored plan is stale", async () => {
    setAuth(makeOrg({ plan: "BASIC" }));
    mockSubRetrieve.mockResolvedValue(subscriptionWithPrice("price_premium"));

    const res = await app.request("/billing/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { plan: string };
    expect(body.plan).toBe("PREMIUM");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "PREMIUM" }),
    );
  });

  it("does not write when the stored plan already matches Stripe", async () => {
    setAuth(makeOrg({ plan: "PREMIUM" }));
    mockSubRetrieve.mockResolvedValue(subscriptionWithPrice("price_premium"));

    const res = await app.request("/billing/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { plan: string };
    expect(body.plan).toBe("PREMIUM");
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("skips Stripe entirely when the org has no subscription", async () => {
    setAuth(makeOrg({ plan: "FREE", stripeSubscriptionId: null }));

    const res = await app.request("/billing/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { plan: string };
    expect(body.plan).toBe("FREE");
    expect(mockSubRetrieve).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("degrades to the stored plan when Stripe is unreachable", async () => {
    setAuth(makeOrg({ plan: "BASIC" }));
    mockSubRetrieve.mockRejectedValue(new Error("Stripe is down"));

    const res = await app.request("/billing/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { plan: string };
    expect(body.plan).toBe("BASIC");
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });
});
