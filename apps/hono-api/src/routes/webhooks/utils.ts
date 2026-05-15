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
