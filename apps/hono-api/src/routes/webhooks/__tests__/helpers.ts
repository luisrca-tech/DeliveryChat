import { type Mock, vi } from "vitest";
import { Hono } from "hono";
import type Stripe from "stripe";

export const mockInsert: Mock = vi.fn();

export function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "innerJoin",
    "leftJoin",
    "orderBy",
    "limit",
    "offset",
    "values",
    "set",
  ];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.returning = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

export function makeStripeEvent(type: string, data: unknown): Stripe.Event {
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

export function makeOrg(overrides: Record<string, unknown> = {}) {
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

export function setupMocks(
  org: ReturnType<typeof makeOrg>,
  mockTransaction: ReturnType<typeof vi.fn>,
) {
  mockInsert.mockReturnValue(chainMock([]));

  const txSelectChain = chainMock([org]);
  const txUpdateChain = chainMock([]);

  const tx = {
    select: vi.fn(() => txSelectChain),
    update: vi.fn(() => txUpdateChain),
    insert: vi.fn(() => chainMock([])),
  };

  mockTransaction.mockImplementation(
    async (fn: (t: Record<string, unknown>) => Promise<void>) => {
      await fn(tx);
    },
  );

  return { tx, txUpdateChain };
}

export function createTestApp(webhooksRoute: Hono) {
  return new Hono().route("/webhooks", webhooksRoute);
}

export async function postWebhook(app: Hono, event: Stripe.Event) {
  return app.request("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "sig_test",
    },
    body: JSON.stringify(event),
  });
}
