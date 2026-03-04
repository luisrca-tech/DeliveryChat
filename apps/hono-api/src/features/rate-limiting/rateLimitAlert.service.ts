import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rateLimitEvents } from "../../db/schema/rateLimitEvents.js";
import { rateLimitAlertsSent } from "../../db/schema/rateLimitAlertsSent.js";
import { sendRateLimitAlertEmail } from "../../lib/email/rateLimit.js";
import type { RateLimitWindow } from "./types.js";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  billingEmail: string | null;
  plan: string;
};

const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export async function recordRateLimitExceeded(
  tenantId: string,
  org: OrganizationRow,
  window: RateLimitWindow,
  currentCount: number,
  limit: number,
): Promise<void> {
  const id = `evt_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(rateLimitEvents).values({
    id,
    tenantId,
    eventType: "EXCEEDED",
    window,
    limitValue: limit,
    currentCount,
  });

  await checkAndEmitAlert(tenantId, org, window, currentCount, limit);
}

async function checkAndEmitAlert(
  tenantId: string,
  org: OrganizationRow,
  window: RateLimitWindow,
  currentCount: number,
  limit: number,
): Promise<void> {
  const oneHourAgo = new Date(Date.now() - ALERT_COOLDOWN_MS);

  const [existing] = await db
    .select()
    .from(rateLimitAlertsSent)
    .where(
      and(
        eq(rateLimitAlertsSent.tenantId, tenantId),
        eq(rateLimitAlertsSent.windowType, window),
      ),
    )
    .limit(1);

  if (existing && existing.lastSentAt > oneHourAgo) return;

  const toEmail = org.billingEmail;
  if (!toEmail) {
    console.warn(
      `[RateLimit] No billing email for org ${tenantId}, skipping alert`,
    );
    return;
  }

  try {
    await sendRateLimitAlertEmail({
      to: toEmail,
      organizationName: org.name,
      window,
      currentCount,
      limit,
    });

    await db
      .insert(rateLimitAlertsSent)
      .values({
        tenantId,
        windowType: window,
        lastSentAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [rateLimitAlertsSent.tenantId, rateLimitAlertsSent.windowType],
        set: { lastSentAt: new Date() },
      });

    await db.insert(rateLimitEvents).values({
      id: `evt_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      eventType: "ALERT_SENT",
      window,
      limitValue: limit,
      currentCount,
    });
  } catch (err) {
    console.error("[RateLimit] Failed to send alert email:", err);
  }
}
