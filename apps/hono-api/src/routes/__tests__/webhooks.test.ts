import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type Stripe from "stripe";

const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

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

vi.mock("../../db/index.js", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    transaction: vi.fn(),
  },
}));

const { db } = await import("../../db/index.js");
const mockTransaction = db.transaction as ReturnType<typeof vi.fn>;

vi.mock("../../db/schema/organization.js", () => ({
  organization: { id: "id", stripeCustomerId: "stripe_customer_id" },
}));

vi.mock("../../db/schema/processedEvents.js", () => ({
  processedEvents: { id: "id" },
}));

vi.mock("../../env.js", () => ({
  env: { SIGNING_STRIPE_SECRET_KEY: "whsec_test" },
}));

const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
vi.mock("../../lib/stripe.js", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
    },
  },
}));

vi.mock("../../lib/email/index.js", () => ({
  sendInvoiceReceiptEmail: vi.fn(),
  sendPaymentFailedEmail: vi.fn(),
  sendPlanUpgradedEmail: vi.fn(),
  sendSubscriptionCanceledEmail: vi.fn(),
  sendTrialStartedEmail: vi.fn(),
}));

vi.mock("../../utils/date.js", () => ({
  formatDate: (d: Date) => d.toISOString(),
}));

const { webhooksRoute } = await import("../webhooks.js");

const app = new Hono().route("/webhooks", webhooksRoute);

function makeStripeEvent(type: string, data: unknown): Stripe.Event {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: { object: data },
    object: "event",
    api_version: "2024-04-10",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    plan: "FREE",
    planStatus: "trialing",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: null,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    billingEmail: "billing@test.com",
    ...overrides,
  };
}

async function postWebhook(event: Stripe.Event) {
  return app.request("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "sig_test",
    },
    body: JSON.stringify(event),
  });
}

function setupMocks(org: ReturnType<typeof makeOrg>) {
  mockInsert.mockReturnValue(chainMock([]));

  const txSelectChain = chainMock([org]);
  const txUpdateChain = chainMock([]);

  const tx = {
    select: vi.fn(() => txSelectChain),
    update: vi.fn(() => txUpdateChain),
    insert: vi.fn(() => chainMock([])),
  };

  mockTransaction.mockImplementation(async (fn: (t: Record<string, unknown>) => Promise<void>) => {
    await fn(tx);
  });

  return { tx, txUpdateChain };
}

describe("webhooks — customer.subscription.updated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs plan from subscription.metadata when transitioning trialing → active", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { tx, txUpdateChain } = setupMocks(org);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "PREMIUM" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "active",
      plan: "PREMIUM",
    });
  });

  it("syncs plan from subscription.metadata when status is trialing", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: null });
    const { txUpdateChain } = setupMocks(org);

    const trialEnd = Math.floor(Date.now() / 1000) + 14 * 86400;
    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "trialing",
      trial_end: trialEnd,
      cancel_at_period_end: false,
      current_period_end: trialEnd,
      metadata: { plan: "BASIC" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "trialing",
      plan: "BASIC",
    });
  });

  it("does not set plan when metadata.plan is invalid", async () => {
    const org = makeOrg({ plan: "PREMIUM", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "INVALID_PLAN" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall.plan).toBeUndefined();
  });
});

describe("webhooks — customer.subscription.deleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets plan to FREE when subscription is deleted", async () => {
    const org = makeOrg({ plan: "PREMIUM", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org);

    const event = makeStripeEvent("customer.subscription.deleted", {
      id: "sub_test",
      customer: "cus_test",
      status: "canceled",
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "canceled",
      plan: "FREE",
      stripeSubscriptionId: null,
    });
  });
});

describe("webhooks — invoice.paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs plan from subscription metadata as safety net", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org);

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_test",
      metadata: { plan: "PREMIUM" },
    });

    const event = makeStripeEvent("invoice.paid", {
      customer: "cus_test",
      amount_paid: 2900,
      currency: "usd",
      hosted_invoice_url: null,
      invoice_pdf: null,
      lines: { data: [{ price: { recurring: { interval: "month" } } }] },
      subscription: "sub_test",
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_test");

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "active",
      plan: "PREMIUM",
    });
  });
});

describe("webhooks — checkout.session.completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs trialEndsAt from subscription when checkout has a trial", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing", trialEndsAt: "2026-04-01T00:00:00Z" });
    const { txUpdateChain } = setupMocks(org);

    const trialEnd = Math.floor(Date.now() / 1000) + 14 * 86400;
    const event = makeStripeEvent("checkout.session.completed", {
      customer: "cus_test",
      subscription: "sub_test",
      client_reference_id: "org-1",
      metadata: { plan: "PREMIUM" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall).toMatchObject({
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      plan: "PREMIUM",
    });
  });

  it("sets planStatus to active (not trialing) when org was already trialing", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org);

    const event = makeStripeEvent("checkout.session.completed", {
      customer: "cus_test",
      subscription: "sub_test",
      client_reference_id: "org-1",
      metadata: { plan: "PREMIUM" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall.planStatus).not.toBe("trialing");
  });
});

describe("webhooks — customer.subscription.created", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs plan, subscriptionId, planStatus, and trialEndsAt on new subscription", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing", stripeSubscriptionId: null });
    const { txUpdateChain } = setupMocks(org);

    const trialEnd = Math.floor(Date.now() / 1000) + 14 * 86400;
    const event = makeStripeEvent("customer.subscription.created", {
      id: "sub_new",
      customer: "cus_test",
      status: "trialing",
      trial_end: trialEnd,
      cancel_at_period_end: false,
      metadata: { plan: "PREMIUM" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall).toMatchObject({
      plan: "PREMIUM",
      planStatus: "trialing",
      stripeSubscriptionId: "sub_new",
    });
    expect(setCall.trialEndsAt).toBeDefined();
  });

  it("sets planStatus to active when subscription starts without trial", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org);

    const event = makeStripeEvent("customer.subscription.created", {
      id: "sub_new",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      metadata: { plan: "BASIC" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(setCall).toMatchObject({
      plan: "BASIC",
      planStatus: "active",
      stripeSubscriptionId: "sub_new",
    });
  });
});
