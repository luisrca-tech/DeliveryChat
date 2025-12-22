/**
 * Cleanup Job: Expire and Delete Pending Accounts
 *
 * This job should be run:
 * - Primary cleanup (expire): Daily
 * - Secondary cleanup (hard delete): Weekly/Monthly
 *
 * Can be scheduled using:
 * - Cron jobs
 * - Background workers
 * - Scheduled tasks
 */

import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { organization } from "../db/schema/organization.js";
import { eq, lt, and } from "drizzle-orm";
import { shouldExpireUser } from "../lib/accountLifecycle.js";

export async function expirePendingAccounts(): Promise<{
  expiredUsers: number;
  expiredOrganizations: number;
}> {
  const pendingUsers = await db
    .select()
    .from(user)
    .where(eq(user.status, "PENDING_VERIFICATION"));

  let expiredUsersCount = 0;
  const now = new Date().toISOString();

  for (const pendingUser of pendingUsers) {
    if (shouldExpireUser(pendingUser)) {
      await db
        .update(user)
        .set({
          status: "EXPIRED",
          expiredAt: now,
          updatedAt: now,
        })
        .where(eq(user.id, pendingUser.id));
      expiredUsersCount++;
    }
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const orgsToExpire = await db
    .select()
    .from(organization)
    .where(
      and(
        eq(organization.status, "PENDING_VERIFICATION"),
        lt(organization.createdAt, sevenDaysAgo.toISOString()),
      ),
    );

  const expiredOrganizationsCount = orgsToExpire.length;

  if (orgsToExpire.length > 0) {
    await db
      .update(organization)
      .set({
        status: "EXPIRED",
        expiredAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(organization.status, "PENDING_VERIFICATION"),
          lt(organization.createdAt, sevenDaysAgo.toISOString()),
        ),
      );
  }

  return {
    expiredUsers: expiredUsersCount,
    expiredOrganizations: expiredOrganizationsCount,
  };
}

export async function deleteExpiredAccounts(): Promise<{
  deletedUsers: number;
  deletedOrganizations: number;
}> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const usersToDelete = await db
    .select()
    .from(user)
    .where(
      and(
        eq(user.status, "EXPIRED"),
        lt(user.expiredAt, ninetyDaysAgo.toISOString()),
      ),
    );

  const orgsToDelete = await db
    .select()
    .from(organization)
    .where(
      and(
        eq(organization.status, "EXPIRED"),
        lt(organization.expiredAt, ninetyDaysAgo.toISOString()),
      ),
    );

  const deletedUsersCount = usersToDelete.length;
  const deletedOrganizationsCount = orgsToDelete.length;

  if (usersToDelete.length > 0) {
    await db
      .delete(user)
      .where(
        and(
          eq(user.status, "EXPIRED"),
          lt(user.expiredAt, ninetyDaysAgo.toISOString()),
        ),
      );
  }

  if (orgsToDelete.length > 0) {
    await db
      .delete(organization)
      .where(
        and(
          eq(organization.status, "EXPIRED"),
          lt(organization.expiredAt, ninetyDaysAgo.toISOString()),
        ),
      );
  }

  return {
    deletedUsers: deletedUsersCount,
    deletedOrganizations: deletedOrganizationsCount,
  };
}

export async function runCleanup(): Promise<void> {
  console.info("[Cleanup] Starting pending accounts cleanup...");

  try {
    const expireResult = await expirePendingAccounts();
    console.info(
      `[Cleanup] Expired ${expireResult.expiredUsers} users and ${expireResult.expiredOrganizations} organizations`,
    );

    const deleteResult = await deleteExpiredAccounts();
    console.info(
      `[Cleanup] Deleted ${deleteResult.deletedUsers} users and ${deleteResult.deletedOrganizations} organizations`,
    );

    console.info("[Cleanup] Cleanup completed successfully");
  } catch (error) {
    console.error("[Cleanup] Cleanup failed:", error);
    throw error;
  }
}
