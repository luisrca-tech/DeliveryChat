import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organization } from "../db/schema/organization.js";
import { sendTrialEndingSoonEmail } from "../lib/email.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(isoDate: string, now: Date): number | null {
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function sendTrialEndingSoonReminders(): Promise<{
  scanned: number;
  sent: number;
  skippedMissingEmail: number;
}> {
  const trialingOrgs = await db
    .select({
      id: organization.id,
      name: organization.name,
      plan: organization.plan,
      planStatus: organization.planStatus,
      trialEndsAt: organization.trialEndsAt,
      billingEmail: organization.billingEmail,
    })
    .from(organization)
    .where(and(eq(organization.planStatus, "trialing")));

  const now = new Date();
  let sent = 0;
  let skippedMissingEmail = 0;

  for (const org of trialingOrgs) {
    if (!org.trialEndsAt) continue;
    const daysLeft = daysUntil(org.trialEndsAt, now);
    if (daysLeft !== 3) continue;

    if (!org.billingEmail) {
      skippedMissingEmail++;
      continue;
    }

    if (
      org.plan !== "BASIC" &&
      org.plan !== "PREMIUM" &&
      org.plan !== "ENTERPRISE"
    ) {
      continue;
    }

    await sendTrialEndingSoonEmail({
      email: org.billingEmail,
      plan: org.plan,
      trialEndsAt: formatDate(new Date(org.trialEndsAt)),
      daysLeft,
      organizationName: org.name,
    });

    sent++;
  }

  return { scanned: trialingOrgs.length, sent, skippedMissingEmail };
}

