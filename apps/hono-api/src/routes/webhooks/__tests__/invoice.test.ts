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
const mockSubscriptionsRetrieve = vi.fn();
vi.mock("../../../lib/stripe.js", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
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

describe("webhooks — invoice.paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs plan from subscription metadata as safety net", async () => {
    const org = makeOrg({ plan: "FREE", planStatus: "trialing" });
    const { txUpdateChain } = setupMocks(org, mockTransaction);

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

    const res = await postWebhook(app, event);
    expect(res.status).toBe(200);

    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_test");

    const setCall = (txUpdateChain.set as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(setCall).toMatchObject({
      planStatus: "active",
      plan: "PREMIUM",
    });
  });
});
