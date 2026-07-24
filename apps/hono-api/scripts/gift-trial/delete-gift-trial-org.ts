import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { stripe } from "../../src/lib/stripe.js";
import { user } from "../../src/db/schema/users.js";
import { organization } from "../../src/db/schema/organization.js";
import { applications } from "../../src/db/schema/applications.js";
import { visitorIdentities } from "../../src/db/schema/visitorIdentities.js";
import { verification } from "../../src/db/schema/verification.js";
import {
  GIFT_TRIAL_ACCOUNTS,
  type GiftTrialAccount,
} from "./giftTrialAccounts.js";

/**
 * Gift-trial teardown script.
 *
 * Deletes EVERYTHING tied to EVERY gift-trial account in `giftTrialAccounts.ts`,
 * and cancels each org's Stripe subscription + customer (the DB delete alone
 * does NOT touch Stripe).
 *
 * Each account is resolved from the DB by organization slug and admin email —
 * no IDs are pasted. Accounts not found are reported and skipped.
 *
 * Run with an explicit confirmation flag so it can never fire by accident:
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

async function cancelStripe(orgId: string): Promise<void> {
  const rows = await db
    .select({
      subscriptionId: organization.stripeSubscriptionId,
      customerId: organization.stripeCustomerId,
    })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  const org = rows[0];
  if (!org) return;

  if (org.subscriptionId) {
    try {
      await stripe.subscriptions.cancel(org.subscriptionId);
      console.log(
        `[gift-trial:delete]   Stripe subscription canceled: ${org.subscriptionId}`,
      );
    } catch (error) {
      console.warn(
        `[gift-trial:delete]   Could not cancel subscription ${org.subscriptionId} (may already be canceled):`,
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.log("[gift-trial:delete]   No stripeSubscriptionId on the org.");
  }

  if (org.customerId) {
    try {
      await stripe.customers.del(org.customerId);
      console.log(
        `[gift-trial:delete]   Stripe customer deleted: ${org.customerId}`,
      );
    } catch (error) {
      console.warn(
        `[gift-trial:delete]   Could not delete customer ${org.customerId} (may already be gone):`,
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.log("[gift-trial:delete]   No stripeCustomerId on the org.");
  }
}

type DeleteOutcome = "deleted" | "not_found";

async function deleteAccount(
  account: GiftTrialAccount,
): Promise<DeleteOutcome> {
  const { companyName, subdomain, admin } = account;
  console.log(`\n[gift-trial:delete] === ${companyName} (${subdomain}) ===`);

  // Resolve org by slug and admin user by email.
  const orgRow = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, subdomain))
    .limit(1);
  const orgId = orgRow[0]?.id ?? null;

  const userRow = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, admin.email))
    .limit(1);
  const userId = userRow[0]?.id ?? null;

  if (!orgId && !userId) {
    console.log("[gift-trial:delete]   Nothing found (no org, no user).");
    return "not_found";
  }

  if (orgId) {
    // --- 1. Stripe first (DB deletion won't cancel billing) ------------------
    await cancelStripe(orgId);

    // --- 2. Collect orphan anonymous visitor users before their links go -----
    const visitorRows = await db
      .select({ anonymousUserId: visitorIdentities.anonymousUserId })
      .from(visitorIdentities)
      .where(eq(visitorIdentities.organizationId, orgId));
    const anonymousUserIds = [
      ...new Set(visitorRows.map((r) => r.anonymousUserId)),
    ];

    // --- 3. Applications (cascades apiKeys / dataSource / dataTool / aiContext)
    const deletedApps = await db
      .delete(applications)
      .where(eq(applications.organizationId, orgId))
      .returning({ id: applications.id });
    console.log(
      `[gift-trial:delete]   applications deleted: ${deletedApps.length}`,
    );

    // --- 4. Visitor identities (no cascade to org) ---------------------------
    const deletedVisitors = await db
      .delete(visitorIdentities)
      .where(eq(visitorIdentities.organizationId, orgId))
      .returning({ id: visitorIdentities.id });
    console.log(
      `[gift-trial:delete]   visitorIdentities deleted: ${deletedVisitors.length}`,
    );

    // --- 5. Organization (cascades member, conversations -> messages/participants,
    //        tenantRateLimits, rateLimitEvents, rateLimitAlertsSent, aiUsageLog) -
    const deletedOrg = await db
      .delete(organization)
      .where(eq(organization.id, orgId))
      .returning({ id: organization.id });
    console.log(
      `[gift-trial:delete]   organization deleted: ${deletedOrg.length}`,
    );

    // --- 7. Orphan anonymous visitor users (best-effort) ---------------------
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
          `[gift-trial:delete]   Skipped anonymous user ${id} (still referenced elsewhere):`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    if (anonymousUserIds.length > 0) {
      console.log(
        `[gift-trial:delete]   anonymous visitor users deleted: ${anonDeleted}/${anonymousUserIds.length}`,
      );
    }
  } else {
    console.log("[gift-trial:delete]   No org for this slug; skipping org teardown.");
  }

  // --- 6. Admin user (cascades session, account) -----------------------------
  if (userId) {
    const deletedUser = await db
      .delete(user)
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    console.log(
      `[gift-trial:delete]   admin user deleted: ${deletedUser.length}`,
    );
  }

  // --- 8. Verification rows (keyed by email identifier, not an FK) -----------
  const deletedVerifications = await db
    .delete(verification)
    .where(eq(verification.identifier, admin.email))
    .returning({ id: verification.id });
  console.log(
    `[gift-trial:delete]   verification rows deleted: ${deletedVerifications.length}`,
  );

  return "deleted";
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "[gift-trial:delete] Refusing to run without --confirm. This permanently deletes the gift-trial orgs and cancels their Stripe subscriptions. Re-run with --confirm.",
    );
    process.exit(2);
  }

  console.log(
    `[gift-trial:delete] Tearing down ${GIFT_TRIAL_ACCOUNTS.length} gift-trial account(s).`,
  );

  const summary: Array<{ subdomain: string; outcome: DeleteOutcome }> = [];
  for (const account of GIFT_TRIAL_ACCOUNTS) {
    const outcome = await deleteAccount(account);
    summary.push({ subdomain: account.subdomain, outcome });
  }

  console.log("\n========================================================");
  console.log(" GIFT TRIAL — DELETE SUMMARY");
  console.log("========================================================");
  for (const { subdomain, outcome } of summary) {
    console.log(
      ` [${outcome === "deleted" ? "DELETED" : "NOT FOUND"}] ${subdomain}`,
    );
  }
  console.log("========================================================\n");

  console.log("[gift-trial:delete] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[gift-trial:delete] Failed:", err);
  process.exit(1);
});
