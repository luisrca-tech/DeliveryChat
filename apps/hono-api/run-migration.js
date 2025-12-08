import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = "";

const migrationSQL = readFileSync(
  join(__dirname, "drizzle/0000_early_the_leader.sql"),
  "utf-8"
);

const client = new Client({
  connectionString: DATABASE_URL,
});

async function runMigration() {
  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("Connected successfully!");

    console.log("Running migration...");
    await client.query(migrationSQL);
    console.log("Migration completed successfully!");

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'delivery_chat_%'
      ORDER BY table_name;
    `);

    console.log("\nTables created:");
    result.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });
  } catch (error) {
    if (error.message.includes("already exists")) {
      console.log("Tables already exist. Migration may have already been run.");
    } else {
      console.error("Migration error:", error.message);
      throw error;
    }
  } finally {
    await client.end();
  }
}

runMigration().catch((error) => {
  console.error("Failed to run migration:", error);
  process.exit(1);
});
