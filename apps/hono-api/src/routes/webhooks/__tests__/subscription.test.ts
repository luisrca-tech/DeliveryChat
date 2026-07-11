import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockInsert,
  chainMock,
  makeStripeEvent,
  makeOrg,
  setupMocks,
  createTestApp,
  postWebhook,
} from "./helpers.js";

vi.mock("../../../db/index.js", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: vi.fn(() => chainMock([])),
    update: vi.fn(() => chainMock([])),
    select: vi.fn(() => chainMock([])),
    transaction: vi.fn(),
  },
}));

const { db } = await import("../../../db/index.js");
const mockTransaction = db.transaction as ReturnType<typeof vi.fn>;

vi.mock("../../../db/schema/organization.js", () => ({
  organization: { id: "id", stripeCustomerId: "stripe_customer_id" },
}));

vi.mock("../../../db/schema/processedEvents.js", () => ({
  processedEvents: { id: "id" },
}));

vi.mock("../../../env.js", () => ({
  env: {
    SIGNING_STRIPE_SECRET_KEY: "whsec_test",
    STRIPE_AI_ADDON_PRICE_KEY: "price_ai_addon",
  },
}));

const mockConstructEvent = vi.fn();
const mockSubscriptionItemsDel = vi.fn();
vi.mock("../../../lib/stripe.js", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
    subscriptionItems: {
      del: (...args: unknown[]) => mockSubscriptionItemsDel(...args),
    },
  },
}));

/** Builds a Stripe subscription `items.data` array for the given price ids. */
function makeItems(prices: Array<{ id: string; priceId: string }>) {
  return {
    data: prices.map(({ id, priceId }) => ({
      id,
      price: { id: priceId, lookup_key: null },
    })),
  };
}

vi.mock("../../../lib/email/index.js", () => ({
  sendInvoiceReceiptEmail: vi.fn(),
  sendPaymentFailedEmail: vi.fn(),
  sendPlanUpgradedEmail: vi.fn(),
  sendSubscriptionCanceledEmail: vi.fn(),
  sendTrialStartedEmail: vi.fn(),
}));

vi.mock("../../../utils/date.js", () => ({
  formatDate: (d: Date) => d.toISOString(),
}));

const { webhooksRoute } = await import("../index.js");
const app = createTestApp(webhooksRoute);

describe("webhooks — customer.subscription.updated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs plan from subscription.metadata when transitioning trialing → active", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

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

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "active",
      plan: "PREMIUM",
    });
  });

  it("syncs plan from subscription.metadata when status is trialing", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: null });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

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

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "trialing",
      plan: "BASIC",
    });
  });

  it("does not set plan when metadata.plan is invalid", async () => {
    const org = makeOrg({ plan: "PREMIUM", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

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

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.plan).toBeUndefined();
  });
});

describe("webhooks — customer.subscription.deleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets plan to FREE when subscription is deleted", async () => {
    const org = makeOrg({ plan: "PREMIUM", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.deleted", {
      id: "sub_test",
      customer: "cus_test",
      status: "canceled",
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "canceled",
      plan: "FREE",
      stripeSubscriptionId: null,
    });
  });
});

describe("webhooks — customer.subscription.created", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs plan, subscriptionId, planStatus, and trialEndsAt on new subscription", async () => {
    const org = makeOrg({
      plan: "FREE",
      planStatus: "trialing",
      stripeSubscriptionId: null,
    });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

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

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall).toMatchObject({
      plan: "PREMIUM",
      planStatus: "trialing",
      stripeSubscriptionId: "sub_new",
    });
    expect(setCall.trialEndsAt).toBeDefined();
  });

  it("sets planStatus to active when subscription starts without trial", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.created", {
      id: "sub_new",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      metadata: { plan: "BASIC" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall).toMatchObject({
      plan: "BASIC",
      planStatus: "active",
      stripeSubscriptionId: "sub_new",
    });
  });
});

describe("webhooks — AI add-on entitlement derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets aiAddonActive + item id when the add-on item is present (updated)", async () => {
    const org = makeOrg({ plan: "PREMIUM", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "PREMIUM" },
      items: makeItems([
        { id: "si_base", priceId: "price_premium" },
        { id: "si_addon", priceId: "price_ai_addon" },
      ]),
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    // Plan resolution is unaffected by the extra add-on item.
    expect(setCall.plan).toBe("PREMIUM");
    expect(setCall.aiAddonActive).toBe(true);
    expect(setCall.aiAddonSubscriptionItemId).toBe("si_addon");
    expect(mockSubscriptionItemsDel).not.toHaveBeenCalled();
  });

  it("clears aiAddon fields when the add-on item is absent (updated)", async () => {
    const org = makeOrg({
      plan: "PREMIUM",
      planStatus: "active",
      aiAddonActive: true,
      aiAddonSubscriptionItemId: "si_old",
    });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "PREMIUM" },
      items: makeItems([{ id: "si_base", priceId: "price_premium" }]),
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.aiAddonActive).toBe(false);
    expect(setCall.aiAddonSubscriptionItemId).toBeNull();
  });

  it("revokes the add-on item on downgrade to an ineligible plan", async () => {
    const org = makeOrg({
      plan: "PREMIUM",
      planStatus: "active",
      aiAddonActive: true,
      aiAddonSubscriptionItemId: "si_addon",
    });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "BASIC" },
      items: makeItems([
        { id: "si_base", priceId: "price_basic" },
        { id: "si_addon", priceId: "price_ai_addon" },
      ]),
    });
    mockConstructEvent.mockReturnValue(event);
    mockSubscriptionItemsDel.mockResolvedValue({});

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    // Flag cleared immediately for consistency…
    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.plan).toBe("BASIC");
    expect(setCall.aiAddonActive).toBe(false);
    expect(setCall.aiAddonSubscriptionItemId).toBeNull();

    // …and the Stripe item is removed post-commit.
    expect(mockSubscriptionItemsDel).toHaveBeenCalledWith(
      "si_addon",
      expect.objectContaining({ proration_behavior: "create_prorations" }),
    );
  });

  it("clears aiAddon fields when subscription is deleted", async () => {
    const org = makeOrg({
      plan: "PREMIUM",
      planStatus: "active",
      aiAddonActive: true,
      aiAddonSubscriptionItemId: "si_addon",
    });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.deleted", {
      id: "sub_test",
      customer: "cus_test",
      status: "canceled",
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.aiAddonActive).toBe(false);
    expect(setCall.aiAddonSubscriptionItemId).toBeNull();
  });

  it("detects the add-on item by lookup_key fallback", async () => {
    const org = makeOrg({ plan: "ENTERPRISE", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "ENTERPRISE" },
      items: {
        data: [
          {
            id: "si_addon",
            price: { id: "price_mismatch", lookup_key: "ai_addon_monthly" },
          },
        ],
      },
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.aiAddonActive).toBe(true);
    expect(setCall.aiAddonSubscriptionItemId).toBe("si_addon");
  });
});
