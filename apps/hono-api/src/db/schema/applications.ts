import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { applicationKindEnum } from "./enums/applicationKindEnum";
import { organization } from "./organization";

export const applications = createTable(
  "applications",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    name: varchar("name", { length: 255 }).notNull(),
    domain: varchar("domain", { length: 255 }).notNull(),
    kind: applicationKindEnum("kind").notNull().default("production"),
    port: integer("port"),
    allowedOrigins: text("allowed_origins")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    description: text("description"),
    aiEnabled: boolean("ai_enabled").notNull().default(false),
    aiDbEnabled: boolean("ai_db_enabled").notNull().default(false),
    aiAutoRespond: boolean("ai_auto_respond").notNull().default(false),
    settings: jsonb("settings").default({}).notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: index("applications_organization_idx").on(
      table.organizationId,
    ),
    productionDomainUnique: uniqueIndex("applications_production_domain_unique")
      .on(table.domain)
      .where(sql`${table.kind} = 'production' AND ${table.deletedAt} IS NULL`),
    testPortUnique: uniqueIndex("applications_test_port_unique")
      .on(table.organizationId, table.port)
      .where(sql`${table.kind} = 'test' AND ${table.deletedAt} IS NULL`),
    kindPortDomainCheck: check(
      "applications_kind_port_domain_check",
      sql`(${table.kind} = 'test' AND ${table.port} IS NOT NULL AND ${table.domain} = 'localhost') OR (${table.kind} = 'production' AND ${table.port} IS NULL)`,
    ),
  }),
);
