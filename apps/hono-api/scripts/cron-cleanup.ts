import "dotenv/config";
import { runCleanup } from "../src/jobs/cleanupPendingAccounts.js";

async function main() {
  console.log("[Cron] Running cleanup job...");
  await runCleanup();
  console.log("[Cron] Cleanup job completed");
  process.exit(0);
}

main().catch((error) => {
  console.error("[Cron] Cleanup job failed:", error);
  process.exit(1);
});
