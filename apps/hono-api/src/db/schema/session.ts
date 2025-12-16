import { text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { user } from "./users";
import { timestampString } from "./custom-types";

export const session = createTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestampString("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestampString("created_at")
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestampString("updated_at")
    .default(sql`now()`)
    .notNull(),
});
