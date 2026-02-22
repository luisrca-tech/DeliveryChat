import { index, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { applications } from "./applications";
import { keyEnvironmentEnum } from "./enums/keyEnvironmentEnum";

export const apiKeys = createTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }),
    environment: keyEnvironmentEnum("environment").notNull().default("live"),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    keyHashIdx: index("api_keys_key_hash_idx").on(table.keyHash),
    applicationIdx: index("api_keys_application_idx").on(table.applicationId),
  }),
);
