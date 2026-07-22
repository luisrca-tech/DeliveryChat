import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("../../env.js", () => ({
  env: {
    STRIPE_BASIC_PRICE_KEY: "price_basic",
    STRIPE_PREMIUM_PRICE_KEY: "price_premium",
    STRIPE_ENTERPRISE_PRODUCT_KEY: "prod_enterprise",
    STRIPE_AI_ADDON_PRICE_KEY: "price_ai_addon",
  },
}));

const { extractPlanFromMetadata, resolvePlanFromSubscription, resolvePlan } =
  await import("../stripePlan.js");

type ItemSpec = { priceId: string; product?: string; lookupKey?: string };

function makeSubscription(
  items: ItemSpec[],
  metadata: Record<string, string> = {},
): Stripe.Subscription {
  return {
    id: "sub_test",
    metadata,
    items: {
      data: items.map(({ priceId, product, lookupKey }, index) => ({
        id: `si_${index}`,
        price: {
          id: priceId,
          product: product ?? "prod_other",
          lookup_key: lookupKey ?? null,
        },
      })),
    },
  } as unknown as Stripe.Subscription;
}

describe("extractPlanFromMetadata", () => {
  it("returns the plan for valid values", () => {
    expect(extractPlanFromMetadata({ plan: "BASIC" })).toBe("BASIC");
    expect(extractPlanFromMetadata({ plan: "PREMIUM" })).toBe("PREMIUM");
    expect(extractPlanFromMetadata({ plan: "ENTERPRISE" })).toBe("ENTERPRISE");
  });

  it("returns null for unknown, FREE, or missing values", () => {
    expect(extractPlanFromMetadata({ plan: "INVALID" })).toBeNull();
    expect(extractPlanFromMetadata({ plan: "FREE" })).toBeNull();
    expect(extractPlanFromMetadata({})).toBeNull();
    expect(extractPlanFromMetadata(null)).toBeNull();
    expect(extractPlanFromMetadata(undefined)).toBeNull();
  });
});

describe("resolvePlanFromSubscription", () => {
  it("resolves BASIC and PREMIUM from the base item price id", () => {
    expect(
      resolvePlanFromSubscription(
        makeSubscription([{ priceId: "price_basic" }]),
      ),
    ).toBe("BASIC");
    expect(
      resolvePlanFromSubscription(
        makeSubscription([{ priceId: "price_premium" }]),
      ),
    ).toBe("PREMIUM");
  });

  it("resolves ENTERPRISE from the price's product id", () => {
    expect(
      resolvePlanFromSubscription(
        makeSubscription([
          { priceId: "price_enterprise_custom", product: "prod_enterprise" },
        ]),
      ),
    ).toBe("ENTERPRISE");
  });

  it("ignores the AI add-on item when resolving the base plan", () => {
    const subscription = makeSubscription([
      { priceId: "price_ai_addon" },
      { priceId: "price_premium" },
    ]);
    expect(resolvePlanFromSubscription(subscription)).toBe("PREMIUM");
  });

  it("ignores an AI add-on item identified only by its lookup key", () => {
    const subscription = makeSubscription([
      { priceId: "price_addon_other_env", lookupKey: "ai_addon_monthly" },
      { priceId: "price_basic" },
    ]);
    expect(resolvePlanFromSubscription(subscription)).toBe("BASIC");
  });

  it("returns null when no item matches a known plan price", () => {
    expect(
      resolvePlanFromSubscription(makeSubscription([{ priceId: "price_xyz" }])),
    ).toBeNull();
    expect(resolvePlanFromSubscription(makeSubscription([]))).toBeNull();
  });

  it("returns null when the subscription only carries the AI add-on item", () => {
    expect(
      resolvePlanFromSubscription(
        makeSubscription([{ priceId: "price_ai_addon" }]),
      ),
    ).toBeNull();
  });
});

describe("resolvePlan", () => {
  it("prefers the price over stale metadata (the Billing Portal plan switch)", () => {
    const subscription = makeSubscription([{ priceId: "price_premium" }], {
      plan: "BASIC",
    });
    expect(resolvePlan(subscription)).toBe("PREMIUM");
  });

  it("falls back to metadata when the price is not recognized", () => {
    const subscription = makeSubscription([{ priceId: "price_legacy" }], {
      plan: "BASIC",
    });
    expect(resolvePlan(subscription)).toBe("BASIC");
  });

  it("returns null when neither the price nor the metadata resolves", () => {
    expect(
      resolvePlan(makeSubscription([{ priceId: "price_legacy" }])),
    ).toBeNull();
  });
});
