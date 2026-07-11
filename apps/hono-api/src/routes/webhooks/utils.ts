import type Stripe from "stripe";
import type { Context } from "hono";
import { db } from "../../db/index.js";
import { processedEvents } from "../../db/schema/processedEvents.js";
import { env } from "../../env.js";
import { stripe } from "../../lib/stripe.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import { eq } from "drizzle-orm";

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
 * Stripe `lookup_key` for the AI add-on price, used as a fallback identifier
 * when the configured price id is not the one present on the subscription item
 * (e.g. environment mismatch).
 */
export const AI_ADDON_LOOKUP_KEY = "ai_addon_monthly";

/**
 * Finds the AI add-on subscription item on a subscription, if present. The
 * add-on is modeled as a second item on the existing subscription — never a
 * second subscription — so entitlement is derived by scanning the items.
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

export function formatMoney(
  amountMinor: number | null | undefined,
): string | null {
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) {
    return null;
  }
  return (amountMinor / 100).toFixed(2);
}

export type VerifySignatureResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; response: Response };

export async function verifyStripeSignature(
  c: Context,
): Promise<VerifySignatureResult> {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    console.error("[Webhook] Missing stripe-signature header");
    return {
      ok: false,
      response: jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Missing stripe-signature header",
      ),
    };
  }

  const body = await c.req.text();

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.SIGNING_STRIPE_SECRET_KEY,
    );
    return { ok: true, event };
  } catch (error) {
    console.error("[Webhook] Signature verification failed:", error);
    return {
      ok: false,
      response: jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Invalid signature",
      ),
    };
  }
}

export type DeduplicateResult =
  | { ok: true }
  | { ok: false; response: Response };

export async function deduplicateEvent(
  c: Context,
  eventId: string,
): Promise<DeduplicateResult> {
  try {
    await db.insert(processedEvents).values({ id: eventId });
    return { ok: true };
  } catch {
    console.info(`[Webhook] Event ${eventId} already processed, skipping`);
    return {
      ok: false,
      response: c.json(
        { received: true, message: "Event already processed" },
        200,
      ) as unknown as Response,
    };
  }
}

export async function rollbackProcessedEvent(eventId: string): Promise<void> {
  try {
    await db.delete(processedEvents).where(eq(processedEvents.id, eventId));
  } catch (deleteError) {
    console.error(
      "[Webhook] Failed to rollback processed event id:",
      deleteError,
    );
  }
}
