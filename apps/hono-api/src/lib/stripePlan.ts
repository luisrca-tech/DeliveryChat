/**
 * Single source of truth for "which plan is this Stripe subscription on?".
 *
 * The subscription's PRICE is authoritative, not its metadata. Metadata is only
 * ever written by us at checkout (`subscription_data.metadata.plan`), so any plan
 * change made outside checkout — a switch in the Stripe Billing Portal, an edit in
 * the Stripe Dashboard — swaps the subscription's price item while leaving the
 * metadata frozen at the plan the customer originally bought. Deriving the plan
 * from metadata therefore silently reverts the org to its old tier on the next
 * webhook. Deriving it from the price makes every such change self-healing.
 *
 * Metadata survives only as a FALLBACK, for subscriptions whose price is not one
 * we recognize (legacy or hand-made prices in Stripe).
 */
import type Stripe from "stripe";
import { env } from "../env.js";
import { isAiAddonItem } from "../features/ai/entitlement.js";

const VALID_PLANS = ["BASIC", "PREMIUM", "ENTERPRISE"] as const;
export type ValidPlan = (typeof VALID_PLANS)[number];

export function extractPlanFromMetadata(
  metadata: Record<string, string> | null | undefined,
): ValidPlan | null {
  const plan = metadata?.plan;
  if (plan && VALID_PLANS.includes(plan as ValidPlan)) {
    return plan as ValidPlan;
  }
  return null;
}

/**
 * Resolves the plan from the subscription's items, ignoring the AI add-on item
 * (which is a second item on the same subscription and says nothing about the
 * base tier).
 *
 * BASIC and PREMIUM are matched on the configured price ids. ENTERPRISE is matched
 * on the PRODUCT id instead, because enterprise deals are individually negotiated:
 * each one gets its own bespoke price under the shared enterprise product, so there
 * is no single price id to compare against.
 *
 * Returns null when nothing matches, which callers must treat as "leave the current
 * plan alone" — never as a downgrade.
 */
export function resolvePlanFromSubscription(
  subscription: Stripe.Subscription,
): ValidPlan | null {
  const items = subscription.items?.data ?? [];

  for (const item of items) {
    if (isAiAddonItem(item)) continue;

    const price = item.price;
    if (!price) continue;

    if (price.id === env.STRIPE_BASIC_PRICE_KEY) return "BASIC";
    if (price.id === env.STRIPE_PREMIUM_PRICE_KEY) return "PREMIUM";

    const productId =
      typeof price.product === "string" ? price.product : price.product?.id;
    if (productId === env.STRIPE_ENTERPRISE_PRODUCT_KEY) return "ENTERPRISE";
  }

  return null;
}

/**
 * The plan a subscription is on: its price first, its (possibly stale) metadata
 * only as a fallback. This is what every webhook handler and the billing status
 * reconcile use.
 */
export function resolvePlan(
  subscription: Stripe.Subscription,
): ValidPlan | null {
  return (
    resolvePlanFromSubscription(subscription) ??
    extractPlanFromMetadata(subscription.metadata as Record<string, string>)
  );
}
