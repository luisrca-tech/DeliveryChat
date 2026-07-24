import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { auth } from "../../src/lib/auth.js";
import { user } from "../../src/db/schema/users.js";
import { organization } from "../../src/db/schema/organization.js";

/**
 * Gift-trial account creation script.
 *
 * Creates a login-ready, email-verified, ACTIVE organization + super_admin
 * admin user WITHOUT going through the OTP / email-verification flow (the
 * target email is a placeholder that does not receive mail).
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

const GIFT_TRIAL = {
  companyName: "Okane Marketing Trial",
  subdomain: "okane-marketing",
  admin: {
    name: "Andrew Okane",
    email: "andrew@okn.trial",
    password: "Okanetrial123@",
  },
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

async function main() {
  const { companyName, subdomain, admin } = GIFT_TRIAL;
  const { name, email, password } = admin;

  console.log("[gift-trial:create] Starting.");
  console.log(`[gift-trial:create] Company : ${companyName}`);
  console.log(`[gift-trial:create] Subdomain: ${subdomain}`);
  console.log(`[gift-trial:create] Admin   : ${name} <${email}>`);

  // --- Pre-flight: refuse to run against a pre-existing user or slug ---------
  // This keeps the script simple and avoids Better Auth's reactivation path
  // (which uses a bcrypt hash that does not verify on login).
  const existingUser = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    console.error(
      `[gift-trial:create] A user with email "${email}" already exists (id=${existingUser[0].id}). Aborting. Run the delete script first if you want a clean re-create.`,
    );
    process.exit(2);
  }

  const existingOrg = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, subdomain))
    .limit(1);

  if (existingOrg.length > 0) {
    console.error(
      `[gift-trial:create] An organization with slug "${subdomain}" already exists (id=${existingOrg[0].id}). Aborting.`,
    );
    process.exit(2);
  }

  // --- 1. Create the user + credential account (scrypt-hashed password) ------
  const signUpResponse = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(),
    returnHeaders: true,
  });

  const userId = signUpResponse.response?.user?.id;
  if (!userId) {
    console.error("[gift-trial:create] signUpEmail did not return a user id.");
    process.exit(1);
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
    process.exit(1);
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
  try {
    const signIn = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers(),
    });
    if (!signIn?.user?.id) {
      throw new Error("signInEmail returned no user");
    }
    console.log("[gift-trial:create] Login self-check PASSED.");
  } catch (error) {
    console.error(
      "[gift-trial:create] Login self-check FAILED — the account exists but credentials did not verify:",
      error,
    );
    process.exit(1);
  }

  // --- Summary: copy these IDs into delete-gift-trial-org.ts -----------------
  console.log("\n========================================================");
  console.log(" GIFT TRIAL ACCOUNT CREATED");
  console.log("========================================================");
  console.log(` Company   : ${companyName}`);
  console.log(` Subdomain : ${subdomain}`);
  console.log(` Login     : ${email} / ${password}`);
  console.log(
    ` Plan      : FREE (buy PREMIUM + AI add-on via Stripe checkout)`,
  );
  console.log("--------------------------------------------------------");
  console.log(" Paste these into delete-gift-trial-org.ts:");
  console.log(`   const ORG_ID = "${orgId}";`);
  console.log(`   const USER_ID = "${userId}";`);
  console.log(`   const ADMIN_EMAIL = "${email}";`);
  console.log("========================================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("[gift-trial:create] Failed:", err);
  process.exit(1);
});
