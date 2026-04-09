import { index, text, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { timestampString, timestampStringNullable } from "./customTypes";
import { conversationStatusEnum } from "./enums/conversationStatusEnum";
import { organization } from "./organization";
import { applications } from "./applications";
import { user } from "./users";

export const conversations = createTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    status: conversationStatusEnum("status").notNull().default("pending"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    assignedTo: text("assigned_to").references(() => user.id, {
      onDelete: "set null",
    }),
    subject: varchar("subject", { length: 500 }),
    closedAt: timestampStringNullable("closed_at"),
    deletedAt: timestampStringNullable("deleted_at"),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    organizationIdx: index("conversations_organization_idx").on(
      table.organizationId,
    ),
    applicationIdx: index("conversations_application_idx").on(
      table.applicationId,
    ),
    orgStatusIdx: index("conversations_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    assignedToIdx: index("conversations_assigned_to_idx").on(
      table.assignedTo,
    ),
  }),
);
