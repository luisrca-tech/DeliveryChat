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
import { tenantPlanEnum } from "./enums/tenantPlanEnum";

export const tenants = createTable(
  "tenants",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    settings: jsonb("settings").default({}).notNull(),
    plan: tenantPlanEnum("plan").notNull().default("BASIC"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("tenants_slug_unique").on(table.slug),
    slugLookupIdx: index("tenants_slug_idx").on(table.slug),
  })
);
