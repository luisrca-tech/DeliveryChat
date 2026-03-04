import "dotenv/config";
import { runCleanupRateLimitEvents } from "../src/jobs/cleanupRateLimitEvents.js";

async function main() {
  console.log("[Cron] Running rate limit events cleanup...");
  const { deletedCount } = await runCleanupRateLimitEvents();
  console.log(`[Cron] Rate limit cleanup completed. Deleted ${deletedCount} events.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[Cron] Rate limit cleanup failed:", error);
  process.exit(1);
});
