import {
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { tenants } from "./tenants";

export const applications = createTable(
  "applications",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    settings: jsonb("settings").default({}).notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index("applications_tenant_idx").on(table.tenantId),
    slugPerTenantIdx: uniqueIndex("applications_slug_tenant_unique").on(
      table.slug,
      table.tenantId
    ),
  })
);
