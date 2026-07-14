/**
 * Single source of truth for the AI add-on entitlement.
 *
 * The AI add-on is available only on add-on-eligible plans (PREMIUM,
 * ENTERPRISE) and, once purchased, is modeled as a SECOND subscription item on
 * the existing Stripe subscription — never a second subscription. The entitlement
 * columns (`aiAddonActive`, `aiAddonSubscriptionItemId`) are derived exclusively
 * from Stripe webhooks; routes and middleware only ever READ them.
 *
 * Every layer that answers "is the AI add-on eligible / active?" consumes this
 * module, so the plan-eligibility rule and the webhook derivation live in exactly
 * one place:
 *   - `addonEligiblePlan` / `ADDON_ELIGIBLE_PLANS` — the canonical eligible-plan gate.
 *   - `isAddonEntitled` — org is eligible AND the add-on is active.
 *   - `deriveAddonEntitlement` — the webhook derivation (created/updated/deleted).
 *   - `findAiAddonItem` — locate the add-on item on a Stripe subscription.
 */
import type Stripe from "stripe";
import { env } from "../../env.js";
import { planAllowsServing } from "../../lib/planLimits.js";

export const ADDON_ELIGIBLE_PLANS = ["PREMIUM", "ENTERPRISE"] as const;
export type AddonEligiblePlan = (typeof ADDON_ELIGIBLE_PLANS)[number];

/** True when the plan is allowed to hold the AI add-on. */
export function addonEligiblePlan(plan: string | null | undefined): boolean {
  return ADDON_ELIGIBLE_PLANS.includes(plan as AddonEligiblePlan);
}

export type EntitlementOrganization = {
  plan: string;
  aiAddonActive: boolean;
};

/**
 * Org-level entitlement: the plan is add-on eligible AND the add-on is active
 * (`aiAddonActive`, derived from Stripe). This is the org half consumed by both
 * the AI middleware and the per-turn entitlement check.
 */
export function isAddonEntitled(
  organization: EntitlementOrganization,
): boolean {
  return addonEligiblePlan(organization.plan) && organization.aiAddonActive;
}

export type InterviewAccessOrganization = {
  plan: string;
  planStatus: string | null;
  trialEndsAt: string | null;
};

/**
 * Whether the org may run the onboarding interview (authoring, not serving).
 *
 * Serving plans always may. FREE may too — but only inside its 14-day trial
 * window, because interview turns are real LLM calls deliberately excluded from
 * the monthly cap (see QUOTA_EXCLUDED_ACTIONS), so an unbounded FREE tier would
 * be a free token faucet. A FREE org IS a trialing org: registration stamps
 * `planStatus = 'trialing'` and `trialEndsAt = now + 14d` on every new
 * organization.
 *
 * This is checked explicitly rather than leaned on as a side effect of
 * `checkBillingStatus`, which waves through orgs whose `planStatus` is null
 * (seeds, legacy rows) and would otherwise leave the faucet open.
 */
export function canRunInterview(
  organization: InterviewAccessOrganization,
): boolean {
  if (planAllowsServing(organization.plan)) return true;

  const { planStatus, trialEndsAt } = organization;
  if (planStatus !== "trialing" || !trialEndsAt) return false;

  return Date.now() <= new Date(trialEndsAt).getTime();
}

/**
 * Stripe `lookup_key` for the AI add-on price, used as a fallback identifier when
 * the configured price id is not the one present on the subscription item (e.g.
 * an environment mismatch).
 */
export const AI_ADDON_LOOKUP_KEY = "ai_addon_monthly";

/**
 * Finds the AI add-on subscription item on a subscription, if present. The add-on
 * is a second item on the existing subscription, so entitlement is derived by
 * scanning the items for the configured price id or the lookup-key fallback.
 */
export function findAiAddonItem(
  subscription: Stripe.Subscription,
): Stripe.SubscriptionItem | null {
  const items = subscription.items?.data ?? [];
  for (const item of items) {
    const price = item.price;
    if (!price) continue;
    if (
      price.id === env.STRIPE_AI_ADDON_PRICE_KEY ||
      price.lookup_key === AI_ADDON_LOOKUP_KEY
    ) {
      return item;
    }
  }
  return null;
}

export type AddonEntitlementDerivation = {
  aiAddonActive: boolean;
  aiAddonSubscriptionItemId: string | null;
  /**
   * Set only on downgrade revocation: the add-on item is still on the
   * subscription but the resolved plan is no longer eligible. The webhook handler
   * clears the entitlement immediately and defers deleting this Stripe item until
   * after the transaction commits.
   */
  revokeItemId?: string;
};

/**
 * Derives the AI add-on entitlement from a Stripe subscription and the plan the
 * webhook resolved for the organization. This is the ONE rule shared by the
 * created, updated, and deleted subscription handlers, so all three agree:
 *
 *   - item present + eligible plan  → active, item id retained.
 *   - item absent                   → inactive, no item id.
 *   - item present + INELIGIBLE plan → inactive, no item id, `revokeItemId` set
 *     so the caller removes the orphaned Stripe item post-commit.
 *
 * The plan-eligibility guard here is why a `customer.subscription.created` event
 * carrying an add-on item on an ineligible plan does NOT grant the add-on.
 */
export function deriveAddonEntitlement(
  subscription: Stripe.Subscription,
  resolvedPlan: string | null | undefined,
): AddonEntitlementDerivation {
  const aiItem = findAiAddonItem(subscription);

  if (aiItem && !addonEligiblePlan(resolvedPlan)) {
    return {
      aiAddonActive: false,
      aiAddonSubscriptionItemId: null,
      revokeItemId: aiItem.id,
    };
  }

  return {
    aiAddonActive: !!aiItem,
    aiAddonSubscriptionItemId: aiItem?.id ?? null,
  };
}
