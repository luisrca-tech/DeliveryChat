import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organization } from "../db/schema/organization.js";
import { sendTrialEndingSoonEmail } from "../lib/email/index.js";
import { formatDate, daysUntil } from "../utils/date.js";

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

