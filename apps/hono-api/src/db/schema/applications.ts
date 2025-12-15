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
import { organization } from "./organization";

export const applications = createTable(
  "applications",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    subdomain: varchar("subdomain", { length: 255 }).notNull(),
    description: text("description"),
    settings: jsonb("settings").default({}).notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: index("applications_organization_idx").on(
      table.organizationId
    ),
    slugPerOrganizationIdx: uniqueIndex(
      "applications_slug_organization_unique"
    ).on(table.slug, table.organizationId),
    subdomainPerOrganizationIdx: uniqueIndex(
      "applications_subdomain_organization_unique"
    ).on(table.subdomain, table.organizationId),
  })
);
