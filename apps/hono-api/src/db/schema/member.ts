import { index, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { user } from "./users";
import { organization } from "./organization";
import { timestampString } from "./customTypes";
import { memberRoleEnum } from "./enums/memberRoleEnum";

export const member = createTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("operator"),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("member_user_org_idx").on(table.userId, table.organizationId),
    index("member_org_idx").on(table.organizationId),
  ],
);
