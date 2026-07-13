import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("../../../env.js", () => ({
  env: { STRIPE_AI_ADDON_PRICE_KEY: "price_ai_addon" },
}));

const {
  addonEligiblePlan,
  isAddonEntitled,
  findAiAddonItem,
  deriveAddonEntitlement,
  ADDON_ELIGIBLE_PLANS,
  AI_ADDON_LOOKUP_KEY,
} = await import("../entitlement.js");

/** Builds a minimal Stripe subscription carrying the given item price ids. */
function makeSubscription(
  items: Array<{ id: string; priceId: string; lookupKey?: string | null }>,
): Stripe.Subscription {
  return {
    items: {
      data: items.map(({ id, priceId, lookupKey = null }) => ({
        id,
        price: { id: priceId, lookup_key: lookupKey },
      })),
    },
  } as unknown as Stripe.Subscription;
}

describe("addonEligiblePlan", () => {
  it.each([
    ["PREMIUM", true],
    ["ENTERPRISE", true],
    ["BASIC", false],
    ["FREE", false],
    [null, false],
    [undefined, false],
  ])("plan %s → %s", (plan, expected) => {
    expect(addonEligiblePlan(plan as string | null | undefined)).toBe(expected);
  });

  it("lists exactly PREMIUM and ENTERPRISE as the canonical eligible plans", () => {
    expect([...ADDON_ELIGIBLE_PLANS]).toEqual(["PREMIUM", "ENTERPRISE"]);
  });
});

describe("isAddonEntitled (plan × aiAddonActive matrix)", () => {
  it.each([
    ["PREMIUM", true, true],
    ["PREMIUM", false, false],
    ["ENTERPRISE", true, true],
    ["ENTERPRISE", false, false],
    ["BASIC", true, false],
    ["BASIC", false, false],
    ["FREE", true, false],
    ["FREE", false, false],
  ])("plan %s + active %s → %s", (plan, aiAddonActive, expected) => {
    expect(isAddonEntitled({ plan, aiAddonActive })).toBe(expected);
  });
});

describe("findAiAddonItem", () => {
  it("finds the item by configured price id", () => {
    const sub = makeSubscription([
      { id: "si_base", priceId: "price_premium" },
      { id: "si_addon", priceId: "price_ai_addon" },
    ]);
    expect(findAiAddonItem(sub)?.id).toBe("si_addon");
  });

  it("finds the item by lookup_key fallback when the price id mismatches", () => {
    const sub = makeSubscription([
      { id: "si_addon", priceId: "price_mismatch", lookupKey: AI_ADDON_LOOKUP_KEY },
    ]);
    expect(findAiAddonItem(sub)?.id).toBe("si_addon");
  });

  it("returns null when no add-on item is present", () => {
    const sub = makeSubscription([{ id: "si_base", priceId: "price_premium" }]);
    expect(findAiAddonItem(sub)).toBeNull();
  });

  it("returns null for a subscription without items", () => {
    expect(findAiAddonItem({} as Stripe.Subscription)).toBeNull();
  });
});

describe("deriveAddonEntitlement (plan × item matrix)", () => {
  const withAddon = () =>
    makeSubscription([
      { id: "si_base", priceId: "price_premium" },
      { id: "si_addon", priceId: "price_ai_addon" },
    ]);
  const withoutAddon = () =>
    makeSubscription([{ id: "si_base", priceId: "price_premium" }]);

  it("item present + eligible plan → active, item id retained, no revoke", () => {
    expect(deriveAddonEntitlement(withAddon(), "PREMIUM")).toEqual({
      aiAddonActive: true,
      aiAddonSubscriptionItemId: "si_addon",
    });
    expect(deriveAddonEntitlement(withAddon(), "ENTERPRISE")).toEqual({
      aiAddonActive: true,
      aiAddonSubscriptionItemId: "si_addon",
    });
  });

  it("item absent → inactive, no item id, no revoke (any plan)", () => {
    expect(deriveAddonEntitlement(withoutAddon(), "PREMIUM")).toEqual({
      aiAddonActive: false,
      aiAddonSubscriptionItemId: null,
    });
    expect(deriveAddonEntitlement(withoutAddon(), "BASIC")).toEqual({
      aiAddonActive: false,
      aiAddonSubscriptionItemId: null,
    });
  });

  // Downgrade revocation + the created-path bug fix share this branch: an add-on
  // item on an INELIGIBLE plan must never grant the add-on, and the orphaned
  // Stripe item id is surfaced for post-commit removal.
  it.each(["BASIC", "FREE", null, undefined])(
    "item present + ineligible plan %s → inactive + revokeItemId",
    (plan) => {
      expect(
        deriveAddonEntitlement(withAddon(), plan as string | null | undefined),
      ).toEqual({
        aiAddonActive: false,
        aiAddonSubscriptionItemId: null,
        revokeItemId: "si_addon",
      });
    },
  );
});
