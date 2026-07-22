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
    STRIPE_BASIC_PRICE_KEY: "price_basic",
    STRIPE_PREMIUM_PRICE_KEY: "price_premium",
    STRIPE_ENTERPRISE_PRODUCT_KEY: "prod_enterprise",
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
  sendAiAddonActivatedEmail: vi.fn(),
}));

const { sendAiAddonActivatedEmail } = (await import(
  "../../../lib/email/index.js"
)) as unknown as {
  sendAiAddonActivatedEmail: ReturnType<typeof vi.fn>;
};

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

  it("syncs plan from the item price when the Billing Portal switched plans behind stale metadata", async () => {
    // The Portal swaps the subscription's price item but leaves
    // `metadata.plan` frozen at whatever was bought at checkout. The price wins.
    const org = makeOrg({ plan: "BASIC", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "BASIC" },
      items: makeItems([{ id: "si_base", priceId: "price_premium" }]),
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.plan).toBe("PREMIUM");
  });

  it("syncs a downgrade from the item price when metadata is stale", async () => {
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
      items: makeItems([{ id: "si_base", priceId: "price_basic" }]),
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.plan).toBe("BASIC");
  });

  it("falls back to metadata when the item price is not a recognized plan price", async () => {
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
      items: makeItems([{ id: "si_base", priceId: "price_legacy" }]),
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.plan).toBe("PREMIUM");
  });

  it("leaves the plan untouched when neither the price nor the metadata resolves", async () => {
    const org = makeOrg({ plan: "PREMIUM", planStatus: "active" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: {},
      items: makeItems([{ id: "si_base", priceId: "price_legacy" }]),
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.plan).toBeUndefined();
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

  it("queues the activation email exactly once on the false→true transition", async () => {
    const org = makeOrg({
      plan: "PREMIUM",
      planStatus: "active",
      aiAddonActive: false,
    });
    setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.updated", {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "PREMIUM" },
      items: {
        data: [
          { id: "si_base", price: { id: "price_premium", lookup_key: null } },
          {
            id: "si_addon",
            price: {
              id: "price_ai_addon",
              lookup_key: null,
              unit_amount: 12000,
              currency: "brl",
            },
          },
        ],
      },
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    expect(sendAiAddonActivatedEmail).toHaveBeenCalledTimes(1);
    expect(sendAiAddonActivatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "billing@test.com",
        amount: "120.00",
        currency: "brl",
        organizationName: "Test Org",
        settingsUrl: expect.stringContaining("/settings/billing"),
      }),
    );
  });

  it("does NOT queue the activation email when the add-on was already active", async () => {
    const org = makeOrg({
      plan: "PREMIUM",
      planStatus: "active",
      aiAddonActive: true,
      aiAddonSubscriptionItemId: "si_addon",
    });
    setupMocks(org, mockTransaction);

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

    expect(sendAiAddonActivatedEmail).not.toHaveBeenCalled();
  });

  it("does NOT queue the activation email when the add-on item is removed", async () => {
    const org = makeOrg({
      plan: "PREMIUM",
      planStatus: "active",
      aiAddonActive: true,
      aiAddonSubscriptionItemId: "si_addon",
    });
    setupMocks(org, mockTransaction);

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

    expect(sendAiAddonActivatedEmail).not.toHaveBeenCalled();
  });

  // The created path now shares the SAME derivation as the updated path (via
  // `deriveAddonEntitlement`), so the item detection / plan-eligibility matrix
  // is proven exhaustively in `features/ai/__tests__/entitlement.test.ts`.
  // These two cases only pin the created-handler wiring, including the fixed
  // bug: an add-on item on an ineligible plan must NOT grant the add-on.

  it("sets aiAddon fields on create when the item is present and the plan is eligible", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("customer.subscription.created", {
      id: "sub_new",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
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
    expect(setCall.aiAddonActive).toBe(true);
    expect(setCall.aiAddonSubscriptionItemId).toBe("si_addon");
    expect(mockSubscriptionItemsDel).not.toHaveBeenCalled();
  });

  it("does NOT grant the add-on on create when the item is present but the plan is ineligible (bug fix)", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);
    mockSubscriptionItemsDel.mockResolvedValue({});

    const event = makeStripeEvent("customer.subscription.created", {
      id: "sub_new",
      customer: "cus_test",
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      metadata: { plan: "BASIC" },
      items: makeItems([
        { id: "si_base", priceId: "price_basic" },
        { id: "si_addon", priceId: "price_ai_addon" },
      ]),
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    // Previously this incorrectly set aiAddonActive: true with no plan guard.
    expect(setCall.aiAddonActive).toBe(false);
    expect(setCall.aiAddonSubscriptionItemId).toBeNull();
    // The orphaned Stripe item is revoked post-commit, mirroring a downgrade.
    expect(mockSubscriptionItemsDel).toHaveBeenCalledWith(
      "si_addon",
      expect.objectContaining({ proration_behavior: "create_prorations" }),
    );
  });
});
