import { index, jsonb, text, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { tenantPlanEnum } from "./enums/tenantPlanEnum";
import { statusEnum } from "./enums/statusEnum";
import { timestampString, timestampStringNullable } from "./customTypes";

export const organization = createTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    logo: text("logo"),
    metadata: jsonb("metadata"),
    status: statusEnum("status").notNull().default("PENDING_VERIFICATION"),
    expiredAt: timestampStringNullable("expired_at"),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    description: text("description"),
    plan: tenantPlanEnum("plan").notNull().default("FREE"),
    deletedAt: timestampStringNullable("deleted_at"),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    slugLookupIdx: index("organization_slug_idx").on(table.slug),
  })
);
