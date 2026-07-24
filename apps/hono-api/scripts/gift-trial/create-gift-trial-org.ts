import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { auth } from "../../src/lib/auth.js";
import { user } from "../../src/db/schema/users.js";
import { organization } from "../../src/db/schema/organization.js";
import {
  GIFT_TRIAL_ACCOUNTS,
  type GiftTrialAccount,
} from "./giftTrialAccounts.js";

/**
 * Gift-trial account creation script.
 *
 * Iterates over every account in `giftTrialAccounts.ts` and creates a
 * login-ready, email-verified, ACTIVE organization + super_admin admin user
 * WITHOUT going through the OTP / email-verification flow (the target emails are
 * placeholders that do not receive mail).
 *
 * Accounts that already exist (by admin email OR organization slug) are SKIPPED,
 * so re-running the script only creates whatever is missing.
 *
 * It intentionally leaves the plan on the default FREE tier — the PREMIUM tier
 * and the AI add-on are meant to be purchased afterwards through the real
 * Stripe checkout, so a genuine subscription drives entitlement.
 *
 * The account uses Better Auth's server API (`signUpEmail` / `createOrganization`)
 * so the password is hashed with Better Auth's own algorithm (scrypt) and login
 * verifies correctly. Do NOT replace this with a manual bcrypt insert — the
 * reactivation branch in `routes/register.ts` does that and its hash does NOT
 * verify against Better Auth's default scrypt.
 *
 * Run (hits the environment selected by Infisical — use the PRODUCTION path
 * deliberately):
 *   infisical run --path=/hono-api -- tsx scripts/gift-trial/create-gift-trial-org.ts
 *   # or: bun run gift-trial:create  (from apps/hono-api)
 */

function nowIso(): string {
  return new Date().toISOString();
}

type CreateOutcome =
  | { status: "created"; orgId: string; userId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

async function createAccount(
  account: GiftTrialAccount,
): Promise<CreateOutcome> {
  const { companyName, subdomain, admin } = account;
  const { name, email, password } = admin;

  console.log(`\n[gift-trial:create] === ${companyName} (${subdomain}) ===`);
  console.log(`[gift-trial:create] Admin: ${name} <${email}>`);

  // --- Pre-flight: skip if the user or slug already exists -------------------
  // This keeps the script idempotent and avoids Better Auth's reactivation path
  // (which uses a bcrypt hash that does not verify on login).
  const existingUser = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    const reason = `user "${email}" already exists (id=${existingUser[0].id})`;
    console.log(`[gift-trial:create] SKIP — ${reason}.`);
    return { status: "skipped", reason };
  }

  const existingOrg = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, subdomain))
    .limit(1);

  if (existingOrg.length > 0) {
    const reason = `slug "${subdomain}" already exists (id=${existingOrg[0].id})`;
    console.log(`[gift-trial:create] SKIP — ${reason}.`);
    return { status: "skipped", reason };
  }

  // --- 1. Create the user + credential account (scrypt-hashed password) ------
  const signUpResponse = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(),
    returnHeaders: true,
  });

  const userId = signUpResponse.response?.user?.id;
  if (!userId) {
    return {
      status: "failed",
      reason: "signUpEmail did not return a user id",
    };
  }
  console.log(`[gift-trial:create] User created: ${userId}`);

  // Carry the new session cookie so createOrganization knows the creator.
  const orgHeaders = new Headers();
  const setCookie = signUpResponse.headers.get("set-cookie");
  if (setCookie) orgHeaders.set("cookie", setCookie);

  // --- 2. Create the organization + super_admin membership -------------------
  // The org plugin hooks force plan=FREE and remap the creator's role to
  // super_admin (see lib/auth.ts). slug === subdomain.
  const orgResponse = await auth.api.createOrganization({
    body: { name: companyName, slug: subdomain },
    headers: orgHeaders,
  });

  const orgId = orgResponse?.id;
  if (!orgId) {
    console.error(
      "[gift-trial:create] createOrganization did not return an org id. Cleaning up the orphan user.",
    );
    await db.delete(user).where(eq(user.id, userId));
    return {
      status: "failed",
      reason: "createOrganization did not return an org id",
    };
  }
  console.log(`[gift-trial:create] Organization created: ${orgId}`);

  // --- 3. Flip user + org to ACTIVE and mark the email verified --------------
  // This is what routes/verifyEmail.ts does after OTP — we skip the OTP.
  await db
    .update(user)
    .set({
      status: "ACTIVE",
      emailVerified: nowIso(),
      pendingExpiresAt: null,
      expiredAt: null,
      updatedAt: nowIso(),
    })
    .where(eq(user.id, userId));

  await db
    .update(organization)
    .set({
      status: "ACTIVE",
      billingEmail: email,
      updatedAt: nowIso(),
    })
    .where(eq(organization.id, orgId));

  console.log(
    "[gift-trial:create] user.status=ACTIVE, organization.status=ACTIVE, emailVerified set.",
  );

  // --- 4. Self-check: prove the credentials actually log in ------------------
  const signIn = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
  });
  if (!signIn?.user?.id) {
    return {
      status: "failed",
      reason: "login self-check failed — credentials did not verify",
    };
  }
  console.log("[gift-trial:create] Login self-check PASSED.");

  return { status: "created", orgId, userId };
}

async function main() {
  console.log("[gift-trial:create] Starting.");

  const results: Array<{ account: GiftTrialAccount; outcome: CreateOutcome }> =
    [];

  for (const account of GIFT_TRIAL_ACCOUNTS) {
    try {
      const outcome = await createAccount(account);
      results.push({ account, outcome });
    } catch (error) {
      console.error(
        `[gift-trial:create] Error creating ${account.subdomain}:`,
        error,
      );
      results.push({
        account,
        outcome: {
          status: "failed",
          reason: error instanceof Error ? error.message : "unknown error",
        },
      });
    }
  }

  // --- Summary ---------------------------------------------------------------
  console.log("\n========================================================");
  console.log(" GIFT TRIAL — SUMMARY");
  console.log("========================================================");
  for (const { account, outcome } of results) {
    const { companyName, subdomain, admin } = account;
    if (outcome.status === "created") {
      console.log(` [CREATED] ${companyName} (${subdomain})`);
      console.log(`           Login: ${admin.email} / ${admin.password}`);
      console.log(`           org=${outcome.orgId} user=${outcome.userId}`);
      console.log(
        `           Plan: FREE (buy PREMIUM + AI add-on via Stripe checkout)`,
      );
    } else if (outcome.status === "skipped") {
      console.log(` [SKIPPED] ${companyName} (${subdomain}) — ${outcome.reason}`);
    } else {
      console.log(` [FAILED]  ${companyName} (${subdomain}) — ${outcome.reason}`);
    }
  }
  console.log("========================================================\n");

  const anyFailed = results.some((r) => r.outcome.status === "failed");
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error("[gift-trial:create] Failed:", err);
  process.exit(1);
});
