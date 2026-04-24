import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type Stripe from "stripe";

function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "offset", "values", "set"];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.returning = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("../../db/index.js", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("../../db/schema/organization.js", () => ({
  organization: { id: "id" },
}));

vi.mock("../../db/schema/member.js", () => ({
  member: { organizationId: "organization_id" },
}));

vi.mock("../../db/schema/users.js", () => ({
  user: { id: "id", email: "email", name: "name" },
}));

const mockCheckoutSessionsCreate = vi.fn();
vi.mock("../../lib/stripe.js", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockCheckoutSessionsCreate(...args),
      },
    },
    billingPortal: {
      sessions: { create: vi.fn() },
    },
    customers: { create: vi.fn() },
  },
}));

vi.mock("../../env.js", () => ({
  env: {
    STRIPE_BASIC_PRICE_KEY: "price_basic",
    STRIPE_PREMIUM_PRICE_KEY: "price_premium",
    STRIPE_AUTOMATIC_TAX_ENABLED: false,
  },
}));

vi.mock("../../lib/auth.js", () => ({
  getUserAdminUrl: vi.fn().mockResolvedValue("https://admin.test.com"),
}));

vi.mock("../../lib/email/index.js", () => ({
  sendEnterprisePlanRequestEmail: vi.fn(),
}));

let mockOrganization = {
  id: "org-1",
  name: "Test Org",
  slug: "test-org",
  plan: "FREE",
  planStatus: "trialing",
  stripeCustomerId: "cus_existing",
  stripeSubscriptionId: null,
  trialEndsAt: "2026-05-01T00:00:00Z",
  cancelAtPeriodEnd: false,
  billingEmail: "billing@test.com",
};

vi.mock("../../lib/middleware/auth.js", () => ({
  requireTenantAuth: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  getTenantAuth: () => ({
    user: { id: "user-1" },
    organization: mockOrganization,
    membership: { role: "super_admin" },
  }),
}));

vi.mock("../../lib/middleware/rateLimit.js", () => ({
  createTenantRateLimitMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../../lib/http.js", async () => {
  const actual = await vi.importActual("../../lib/http.js");
  return actual;
});

const { billingRoute } = await import("../billing.js");

const app = new Hono().route("/billing", billingRoute);

describe("POST /billing/checkout — trial_period_days", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDbSelect.mockReturnValue(
      chainMock([{ email: "user@test.com", name: "Test User" }]),
    );
    mockDbInsert.mockReturnValue(chainMock([]));

    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    } as unknown as Stripe.Response<Stripe.Checkout.Session>);
  });

  it("omits trial_period_days when org is already trialing", async () => {
    mockOrganization = {
      ...mockOrganization,
      planStatus: "trialing",
      trialEndsAt: "2026-05-01T00:00:00Z",
    };

    const res = await app.request("/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "premium" }),
    });

    expect(res.status).toBe(200);

    const createArgs = mockCheckoutSessionsCreate.mock.calls[0]?.[0];
    expect(createArgs.subscription_data.trial_period_days).toBeUndefined();
  });

  it("includes trial_period_days when org has no active trial", async () => {
    mockOrganization = {
      ...mockOrganization,
      planStatus: null as unknown as string,
      trialEndsAt: null as unknown as string,
    };

    const res = await app.request("/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "basic" }),
    });

    expect(res.status).toBe(200);

    const createArgs = mockCheckoutSessionsCreate.mock.calls[0]?.[0];
    expect(createArgs.subscription_data.trial_period_days).toBe(14);
  });
});
