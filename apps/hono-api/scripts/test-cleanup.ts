/**
 * E2E Test Script for Cleanup Job
 *
 * This script tests the cleanup job by:
 * 1. Creating test data in different states
 * 2. Running the cleanup job
 * 3. Verifying the results
 * 4. Testing that deleted users can be recreated
 */

import { randomUUID } from "node:crypto";
import { db } from "../src/db/index.js";
import { user } from "../src/db/schema/users.js";
import { organization } from "../src/db/schema/organization.js";
import { account } from "../src/db/schema/account.js";
import { eq, inArray } from "drizzle-orm";
import { runCleanup } from "../src/jobs/cleanupPendingAccounts.js";

const TEST_USER_EXPIRE_ID = "test-user-expire";
const TEST_USER_DELETE_ID = "test-user-delete";
const TEST_USER_CONTROL_ID = "test-user-control";
const TEST_USER_RECREATE_ID = "test-user-recreate";

const TEST_ORG_EXPIRE_ID = "test-org-expire";
const TEST_ORG_DELETE_ID = "test-org-delete";
const TEST_ORG_CONTROL_ID = "test-org-control";

const timestamp = Date.now();
const TEST_EMAIL_EXPIRE = `test-expire-${timestamp}@example.com`;
const TEST_EMAIL_DELETE = `test-delete-${timestamp}@example.com`;
const TEST_EMAIL_CONTROL = `test-control-${timestamp}@example.com`;
const TEST_EMAIL_RECREATE = `test-recreate-${timestamp}@example.com`;

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function getDateDaysAhead(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function cleanupTestData() {
  console.log("\n[Test] Cleaning up any existing test data...");

  const testIds = [
    TEST_USER_EXPIRE_ID,
    TEST_USER_DELETE_ID,
    TEST_USER_CONTROL_ID,
    TEST_USER_RECREATE_ID,
  ];

  if (testIds.length > 0) {
    await db
      .delete(account)
      .where(inArray(account.userId, testIds))
      .catch(() => {});
  }

  if (testIds.length > 0) {
    await db
      .delete(user)
      .where(inArray(user.id, testIds))
      .catch(() => {});
  }

  const testEmails = [
    TEST_EMAIL_EXPIRE,
    TEST_EMAIL_DELETE,
    TEST_EMAIL_CONTROL,
    TEST_EMAIL_RECREATE,
  ];

  for (const email of testEmails) {
    const usersToDelete = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .catch(() => []);

    if (usersToDelete.length > 0) {
      const userIds = usersToDelete.map((u) => u.id);
      await db
        .delete(account)
        .where(inArray(account.userId, userIds))
        .catch(() => {});
      await db
        .delete(user)
        .where(inArray(user.id, userIds))
        .catch(() => {});
    }
  }

  const testOrgIds = [
    TEST_ORG_EXPIRE_ID,
    TEST_ORG_DELETE_ID,
    TEST_ORG_CONTROL_ID,
  ];

  if (testOrgIds.length > 0) {
    await db
      .delete(organization)
      .where(inArray(organization.id, testOrgIds))
      .catch(() => {});
  }

  const slugPatterns = [
    `test-org-expire-${timestamp}`,
    `test-org-delete-${timestamp}`,
    `test-org-control-${timestamp}`,
  ];

  for (const slug of slugPatterns) {
    await db
      .delete(organization)
      .where(eq(organization.slug, slug))
      .catch(() => {});
  }

  console.log("[Test] Cleanup complete");
}

async function createTestData() {
  console.log("\n[Test] Creating test data...");
  const now = new Date().toISOString();

  await db.insert(user).values({
    id: TEST_USER_EXPIRE_ID,
    name: "Test User Expire",
    email: TEST_EMAIL_EXPIRE,
    status: "PENDING_VERIFICATION",
    pendingExpiresAt: getDateDaysAgo(8),
    createdAt: getDateDaysAgo(8),
    updatedAt: now,
  });
  console.log(`[Test] Created user to expire: ${TEST_EMAIL_EXPIRE}`);

  await db.insert(user).values({
    id: TEST_USER_DELETE_ID,
    name: "Test User Delete",
    email: TEST_EMAIL_DELETE,
    status: "EXPIRED",
    expiredAt: getDateDaysAgo(91),
    createdAt: getDateDaysAgo(100),
    updatedAt: now,
  });
  console.log(`[Test] Created user to delete: ${TEST_EMAIL_DELETE}`);

  await db.insert(user).values({
    id: TEST_USER_CONTROL_ID,
    name: "Test User Control",
    email: TEST_EMAIL_CONTROL,
    status: "PENDING_VERIFICATION",
    pendingExpiresAt: getDateDaysAhead(7),
    createdAt: now,
    updatedAt: now,
  });
  console.log(
    `[Test] Created control user (should not expire): ${TEST_EMAIL_CONTROL}`,
  );

  await db.insert(user).values({
    id: TEST_USER_RECREATE_ID,
    name: "Test User Recreate",
    email: TEST_EMAIL_RECREATE,
    status: "EXPIRED",
    expiredAt: getDateDaysAgo(91),
    createdAt: getDateDaysAgo(100),
    updatedAt: now,
  });
  console.log(`[Test] Created user for recreate test: ${TEST_EMAIL_RECREATE}`);

  await db.insert(organization).values({
    id: TEST_ORG_EXPIRE_ID,
    name: "Test Org Expire",
    slug: `test-org-expire-${timestamp}`,
    status: "PENDING_VERIFICATION",
    plan: "FREE",
    createdAt: getDateDaysAgo(8),
    updatedAt: now,
  });
  console.log(`[Test] Created organization to expire: ${TEST_ORG_EXPIRE_ID}`);

  await db.insert(organization).values({
    id: TEST_ORG_DELETE_ID,
    name: "Test Org Delete",
    slug: `test-org-delete-${timestamp}`,
    status: "EXPIRED",
    plan: "FREE",
    expiredAt: getDateDaysAgo(91),
    createdAt: getDateDaysAgo(100),
    updatedAt: now,
  });
  console.log(`[Test] Created organization to delete: ${TEST_ORG_DELETE_ID}`);

  await db.insert(organization).values({
    id: TEST_ORG_CONTROL_ID,
    name: "Test Org Control",
    slug: `test-org-control-${timestamp}`,
    status: "PENDING_VERIFICATION",
    plan: "FREE",
    createdAt: now,
    updatedAt: now,
  });
  console.log(
    `[Test] Created control organization (should not expire): ${TEST_ORG_CONTROL_ID}`,
  );

  console.log("[Test] Test data created successfully");
}

async function verifyResults() {
  console.log("\n[Test] Verifying cleanup results...");

  let allPassed = true;

  const expiredUser = await db
    .select()
    .from(user)
    .where(eq(user.id, TEST_USER_EXPIRE_ID))
    .limit(1);

  if (expiredUser.length === 0) {
    console.error(`[Test] ❌ FAILED: User ${TEST_USER_EXPIRE_ID} not found`);
    allPassed = false;
  } else if (expiredUser[0].status !== "EXPIRED") {
    console.error(
      `[Test] ❌ FAILED: User ${TEST_USER_EXPIRE_ID} status is ${expiredUser[0].status}, expected EXPIRED`,
    );
    allPassed = false;
  } else {
    console.log(
      `[Test] ✅ PASSED: User ${TEST_USER_EXPIRE_ID} correctly expired`,
    );
  }

  const deletedUser = await db
    .select()
    .from(user)
    .where(eq(user.id, TEST_USER_DELETE_ID))
    .limit(1);

  if (deletedUser.length > 0) {
    console.error(
      `[Test] ❌ FAILED: User ${TEST_USER_DELETE_ID} still exists, should have been deleted`,
    );
    allPassed = false;
  } else {
    console.log(
      `[Test] ✅ PASSED: User ${TEST_USER_DELETE_ID} correctly deleted`,
    );
  }

  const controlUser = await db
    .select()
    .from(user)
    .where(eq(user.id, TEST_USER_CONTROL_ID))
    .limit(1);

  if (controlUser.length === 0) {
    console.error(
      `[Test] ❌ FAILED: Control user ${TEST_USER_CONTROL_ID} not found`,
    );
    allPassed = false;
  } else if (controlUser[0].status !== "PENDING_VERIFICATION") {
    console.error(
      `[Test] ❌ FAILED: Control user status is ${controlUser[0].status}, expected PENDING_VERIFICATION`,
    );
    allPassed = false;
  } else {
    console.log(
      `[Test] ✅ PASSED: Control user ${TEST_USER_CONTROL_ID} correctly unchanged`,
    );
  }

  const expiredOrg = await db
    .select()
    .from(organization)
    .where(eq(organization.id, TEST_ORG_EXPIRE_ID))
    .limit(1);

  if (expiredOrg.length === 0) {
    console.error(
      `[Test] ❌ FAILED: Organization ${TEST_ORG_EXPIRE_ID} not found`,
    );
    allPassed = false;
  } else if (expiredOrg[0].status !== "EXPIRED") {
    console.error(
      `[Test] ❌ FAILED: Organization ${TEST_ORG_EXPIRE_ID} status is ${expiredOrg[0].status}, expected EXPIRED`,
    );
    allPassed = false;
  } else {
    console.log(
      `[Test] ✅ PASSED: Organization ${TEST_ORG_EXPIRE_ID} correctly expired`,
    );
  }

  const deletedOrg = await db
    .select()
    .from(organization)
    .where(eq(organization.id, TEST_ORG_DELETE_ID))
    .limit(1);

  if (deletedOrg.length > 0) {
    console.error(
      `[Test] ❌ FAILED: Organization ${TEST_ORG_DELETE_ID} still exists, should have been deleted`,
    );
    allPassed = false;
  } else {
    console.log(
      `[Test] ✅ PASSED: Organization ${TEST_ORG_DELETE_ID} correctly deleted`,
    );
  }

  const controlOrg = await db
    .select()
    .from(organization)
    .where(eq(organization.id, TEST_ORG_CONTROL_ID))
    .limit(1);

  if (controlOrg.length === 0) {
    console.error(
      `[Test] ❌ FAILED: Control organization ${TEST_ORG_CONTROL_ID} not found`,
    );
    allPassed = false;
  } else if (controlOrg[0].status !== "PENDING_VERIFICATION") {
    console.error(
      `[Test] ❌ FAILED: Control organization status is ${controlOrg[0].status}, expected PENDING_VERIFICATION`,
    );
    allPassed = false;
  } else {
    console.log(
      `[Test] ✅ PASSED: Control organization ${TEST_ORG_CONTROL_ID} correctly unchanged`,
    );
  }

  return allPassed;
}

async function testUserRecreation() {
  console.log("\n[Test] Testing user recreation after deletion...");

  const deletedUser = await db
    .select()
    .from(user)
    .where(eq(user.id, TEST_USER_RECREATE_ID))
    .limit(1);

  if (deletedUser.length > 0) {
    console.log(
      `[Test] User ${TEST_USER_RECREATE_ID} still exists, deleting first...`,
    );
    await db.delete(user).where(eq(user.id, TEST_USER_RECREATE_ID));
  }

  try {
    await db.insert(user).values({
      id: randomUUID(),
      name: "Test User Recreated",
      email: TEST_EMAIL_RECREATE,
      status: "PENDING_VERIFICATION",
      pendingExpiresAt: getDateDaysAhead(7),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(
      `[Test] ✅ PASSED: Successfully recreated user with email ${TEST_EMAIL_RECREATE}`,
    );
    return true;
  } catch (error) {
    console.error(
      `[Test] ❌ FAILED: Could not recreate user with email ${TEST_EMAIL_RECREATE}:`,
      error,
    );
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("E2E Test: Cleanup Job");
  console.log("=".repeat(60));

  try {
    // Step 1: Clean up any existing test data
    await cleanupTestData();

    // Step 2: Create test data
    await createTestData();

    // Step 3: Run cleanup job
    console.log("\n[Test] Running cleanup job...");
    await runCleanup();
    console.log("[Test] Cleanup job completed");

    // Step 4: Verify results
    const verificationPassed = await verifyResults();

    // Step 5: Test user recreation
    const recreationPassed = await testUserRecreation();

    // Step 6: Final cleanup
    console.log("\n[Test] Final cleanup of test data...");
    await cleanupTestData();

    console.log("\n" + "=".repeat(60));
    console.log("Test Summary");
    console.log("=".repeat(60));
    console.log(
      `Verification: ${verificationPassed ? "✅ PASSED" : "❌ FAILED"}`,
    );
    console.log(`Recreation: ${recreationPassed ? "✅ PASSED" : "❌ FAILED"}`);

    const allPassed = verificationPassed && recreationPassed;
    console.log(`Overall: ${allPassed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log("=".repeat(60));

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("\n[Test] ❌ Test failed with error:", error);
    process.exit(1);
  }
}

main();
