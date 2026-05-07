import { db } from "../db/index.js";
import { apiKeys } from "../db/schema/apiKeys.js";
import { like } from "drizzle-orm";

const prefix = process.argv[2];
if (!prefix) {
  console.error("Usage: bun run src/scripts/get-creds.ts <key-prefix>");
  process.exit(1);
}

const rows = await db
  .select({ applicationId: apiKeys.applicationId, keyPrefix: apiKeys.keyPrefix })
  .from(apiKeys)
  .where(like(apiKeys.keyPrefix, `${prefix}%`))
  .limit(5);

console.log(JSON.stringify(rows, null, 2));
process.exit(0);
