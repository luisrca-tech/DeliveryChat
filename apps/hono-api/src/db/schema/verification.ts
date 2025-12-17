import { text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { timestampString } from "./customTypes";

export const verification = createTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestampString("expires_at").notNull(),
  createdAt: timestampString("created_at")
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestampString("updated_at")
    .default(sql`now()`)
    .notNull(),
});
