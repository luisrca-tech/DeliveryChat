import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { applications } from "../src/db/schema/applications.js";

type AppRow = {
  id: string;
  domain: string;
  allowedOrigins: string[];
};

async function main() {
  const confirmWildcards = process.argv.includes("--confirm-wildcards");
  const dryRun = process.argv.includes("--dry-run");

  const rows: AppRow[] = await db
    .select({
      id: applications.id,
      domain: applications.domain,
      allowedOrigins: applications.allowedOrigins,
    })
    .from(applications);

  const needsSeed = rows.filter((r) => r.allowedOrigins.length === 0);
  const wildcardsPending = needsSeed.filter((r) => r.domain.startsWith("*."));
  const plainPending = needsSeed.filter((r) => !r.domain.startsWith("*."));

  console.log(
    `[backfill] applications scanned: ${rows.length}; unseeded: ${needsSeed.length} (plain: ${plainPending.length}, wildcards: ${wildcardsPending.length})`,
  );

  if (wildcardsPending.length > 0) {
    console.log("[backfill] Wildcard domains detected; explicit confirmation required:");
    for (const app of wildcardsPending) {
      console.log(`  - ${app.id}  domain="${app.domain}"`);
    }
    if (!confirmWildcards) {
      console.error(
        "[backfill] Refusing to seed wildcard entries. Re-run with --confirm-wildcards after reviewing.",
      );
      process.exit(2);
    }
  }

  const toSeed = confirmWildcards ? needsSeed : plainPending;
  if (toSeed.length === 0) {
    console.log("[backfill] Nothing to seed. Exiting.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("[backfill] --dry-run specified; would seed:");
    for (const app of toSeed) {
      console.log(`  - ${app.id}  "${app.domain}" -> ["${app.domain}"]`);
    }
    process.exit(0);
  }

  let seeded = 0;
  for (const app of toSeed) {
    await db
      .update(applications)
      .set({ allowedOrigins: sql`ARRAY[${app.domain}]::text[]` })
      .where(eq(applications.id, app.id));
    seeded += 1;
  }

  console.log(`[backfill] Seeded ${seeded} application(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Failed:", err);
  process.exit(1);
});
