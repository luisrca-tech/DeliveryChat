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
  env: { SIGNING_STRIPE_SECRET_KEY: "whsec_test" },
}));

const mockConstructEvent = vi.fn();
vi.mock("../../../lib/stripe.js", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}));

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
