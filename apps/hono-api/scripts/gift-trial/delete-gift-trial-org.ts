import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { stripe } from "../../src/lib/stripe.js";
import { user } from "../../src/db/schema/users.js";
import { organization } from "../../src/db/schema/organization.js";
import { applications } from "../../src/db/schema/applications.js";
import { visitorIdentities } from "../../src/db/schema/visitorIdentities.js";
import { verification } from "../../src/db/schema/verification.js";

/**
 * Gift-trial teardown script.
 *
 * Deletes EVERYTHING tied to the gift-trial organization created by
 * create-gift-trial-org.ts, and cancels its Stripe subscription + customer
 * (the DB delete alone does NOT touch Stripe).
 *
 * Fill the three constants below with the values printed by the create script,
 * then run with an explicit confirmation flag so it can never fire by accident:
 *
 *   infisical run --path=/hono-api -- tsx scripts/gift-trial/delete-gift-trial-org.ts --confirm
 *   # or: bun run gift-trial:delete -- --confirm   (from apps/hono-api)
 *
 * Delete order respects the foreign keys (some have no ON DELETE CASCADE to the
 * organization, and applicationAiContext.completedBy -> user is ON DELETE
 * RESTRICT), so applications are removed before the org, and the org before the
 * user:
 *   applications (cascades apiKeys / dataSource / dataTool / applicationAiContext)
 *   -> visitorIdentities (no cascade to org)
 *   -> organization (cascades member, conversations -> messages/participants,
 *                    tenantRateLimits, rateLimitEvents, rateLimitAlertsSent, aiUsageLog)
 *   -> admin user (cascades session, account)
 *   -> orphan anonymous visitor users (best-effort)
 *   -> verification rows (keyed by email, not an FK)
 */

// ---- Fill these from the create script's summary block ----------------------
const ORG_ID = "";
const USER_ID = "";
const ADMIN_EMAIL = "andrew@okn.trial";
// -----------------------------------------------------------------------------

async function cancelStripe(): Promise<void> {
  const rows = await db
    .select({
      subscriptionId: organization.stripeSubscriptionId,
      customerId: organization.stripeCustomerId,
    })
    .from(organization)
    .where(eq(organization.id, ORG_ID))
    .limit(1);

  const org = rows[0];
  if (!org) {
    console.log("[gift-trial:delete] Org row not found; skipping Stripe step.");
    return;
  }

  if (org.subscriptionId) {
    try {
      await stripe.subscriptions.cancel(org.subscriptionId);
      console.log(
        `[gift-trial:delete] Stripe subscription canceled: ${org.subscriptionId}`,
      );
    } catch (error) {
      console.warn(
        `[gift-trial:delete] Could not cancel subscription ${org.subscriptionId} (may already be canceled):`,
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.log("[gift-trial:delete] No stripeSubscriptionId on the org.");
  }

  if (org.customerId) {
    try {
      await stripe.customers.del(org.customerId);
      console.log(
        `[gift-trial:delete] Stripe customer deleted: ${org.customerId}`,
      );
    } catch (error) {
      console.warn(
        `[gift-trial:delete] Could not delete customer ${org.customerId} (may already be gone):`,
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.log("[gift-trial:delete] No stripeCustomerId on the org.");
  }
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "[gift-trial:delete] Refusing to run without --confirm. This permanently deletes the org and cancels Stripe. Re-run with --confirm.",
    );
    process.exit(2);
  }

  if (!ORG_ID || !USER_ID) {
    console.error(
      "[gift-trial:delete] ORG_ID and USER_ID are empty. Paste the values printed by create-gift-trial-org.ts before running.",
    );
    process.exit(2);
  }

  console.log(
    `[gift-trial:delete] Tearing down org=${ORG_ID}, user=${USER_ID}.`,
  );

  // --- 1. Stripe first (DB deletion won't cancel billing) --------------------
  await cancelStripe();

  // --- 2. Collect orphan anonymous visitor users before their links go -------
  const visitorRows = await db
    .select({ anonymousUserId: visitorIdentities.anonymousUserId })
    .from(visitorIdentities)
    .where(eq(visitorIdentities.organizationId, ORG_ID));
  const anonymousUserIds = [
    ...new Set(visitorRows.map((r) => r.anonymousUserId)),
  ];

  // --- 3. Applications (cascades apiKeys / dataSource / dataTool / aiContext) -
  const deletedApps = await db
    .delete(applications)
    .where(eq(applications.organizationId, ORG_ID))
    .returning({ id: applications.id });
  console.log(
    `[gift-trial:delete] applications deleted: ${deletedApps.length}`,
  );

  // --- 4. Visitor identities (no cascade to org) -----------------------------
  const deletedVisitors = await db
    .delete(visitorIdentities)
    .where(eq(visitorIdentities.organizationId, ORG_ID))
    .returning({ id: visitorIdentities.id });
  console.log(
    `[gift-trial:delete] visitorIdentities deleted: ${deletedVisitors.length}`,
  );

  // --- 5. Organization (cascades member, conversations -> messages/participants,
  //        tenantRateLimits, rateLimitEvents, rateLimitAlertsSent, aiUsageLog) --
  const deletedOrg = await db
    .delete(organization)
    .where(eq(organization.id, ORG_ID))
    .returning({ id: organization.id });
  console.log(`[gift-trial:delete] organization deleted: ${deletedOrg.length}`);

  // --- 6. Admin user (cascades session, account) -----------------------------
  const deletedUser = await db
    .delete(user)
    .where(eq(user.id, USER_ID))
    .returning({ id: user.id });
  console.log(`[gift-trial:delete] admin user deleted: ${deletedUser.length}`);

  // --- 7. Orphan anonymous visitor users (best-effort) -----------------------
  // Their conversations/participants are already gone (org cascade), so they
  // should now be unreferenced. Delete individually so one shared/blocked row
  // does not abort the rest.
  let anonDeleted = 0;
  for (const id of anonymousUserIds) {
    try {
      const removed = await db
        .delete(user)
        .where(eq(user.id, id))
        .returning({ id: user.id });
      anonDeleted += removed.length;
    } catch (error) {
      console.warn(
        `[gift-trial:delete] Skipped anonymous user ${id} (still referenced elsewhere):`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (anonymousUserIds.length > 0) {
    console.log(
      `[gift-trial:delete] anonymous visitor users deleted: ${anonDeleted}/${anonymousUserIds.length}`,
    );
  }

  // --- 8. Verification rows (keyed by email identifier, not an FK) -----------
  const emails = ADMIN_EMAIL ? [ADMIN_EMAIL] : [];
  if (emails.length > 0) {
    const deletedVerifications = await db
      .delete(verification)
      .where(inArray(verification.identifier, emails))
      .returning({ id: verification.id });
    console.log(
      `[gift-trial:delete] verification rows deleted: ${deletedVerifications.length}`,
    );
  }

  console.log("[gift-trial:delete] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[gift-trial:delete] Failed:", err);
  process.exit(1);
});
