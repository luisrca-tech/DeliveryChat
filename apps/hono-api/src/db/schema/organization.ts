import {
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { tenantPlanEnum } from "./enums/tenantPlanEnum";

export const organization = createTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    logo: text("logo"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    description: text("description"),
    settings: jsonb("settings").default({}).notNull(),
    plan: tenantPlanEnum("plan").notNull().default("BASIC"),
    deletedAt: timestamp("deleted_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("organization_slug_unique").on(table.slug),
    slugLookupIdx: index("organization_slug_idx").on(table.slug),
  })
);
