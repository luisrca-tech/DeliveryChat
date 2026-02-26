import { lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { rateLimitEvents } from "../db/schema/rateLimitEvents.js";

const RETENTION_DAYS = 90;

export async function runCleanupRateLimitEvents(): Promise<{
  deletedCount: number;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const deleted = await db
    .delete(rateLimitEvents)
    .where(lt(rateLimitEvents.createdAt, cutoff))
    .returning({ id: rateLimitEvents.id });

  const deletedCount = deleted.length;
  console.info(
    `[Cleanup] Deleted ${deletedCount} rate limit events older than ${RETENTION_DAYS} days`,
  );
  return { deletedCount };
}
