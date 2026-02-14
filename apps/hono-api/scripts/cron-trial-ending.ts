import "dotenv/config";
import { sendTrialEndingSoonReminders } from "../src/jobs/trialEndingSoon.js";

async function main() {
  console.log("[Cron] Running trial ending soon reminders...");
  const result = await sendTrialEndingSoonReminders();
  console.log("[Cron] Trial ending soon job completed:", result);
  process.exit(0);
}

main().catch((error) => {
  console.error("[Cron] Trial ending soon job failed:", error);
  process.exit(1);
});
