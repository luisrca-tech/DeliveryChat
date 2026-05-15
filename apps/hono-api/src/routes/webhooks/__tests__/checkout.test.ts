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

describe("webhooks — checkout.session.completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs Stripe IDs and plan from checkout metadata", async () => {
    const org = makeOrg({
      plan: "FREE",
      planStatus: "trialing",
      trialEndsAt: "2026-04-01T00:00:00Z",
    });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("checkout.session.completed", {
      customer: "cus_test",
      subscription: "sub_test",
      client_reference_id: "org-1",
      metadata: { plan: "PREMIUM" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall).toMatchObject({
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      plan: "PREMIUM",
    });
  });

  it("sets planStatus to active (not trialing) when org was already trialing", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

    const event = makeStripeEvent("checkout.session.completed", {
      customer: "cus_test",
      subscription: "sub_test",
      client_reference_id: "org-1",
      metadata: { plan: "PREMIUM" },
    });

    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall.planStatus).toBe("active");
  });
});
