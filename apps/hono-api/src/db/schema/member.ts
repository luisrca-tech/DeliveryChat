import { text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { user } from "./users";
import { organization } from "./organization";
import { timestampString } from "./custom-types";

export const member = createTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("operator"),
  createdAt: timestampString("created_at")
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestampString("updated_at")
    .default(sql`now()`)
    .notNull(),
});
