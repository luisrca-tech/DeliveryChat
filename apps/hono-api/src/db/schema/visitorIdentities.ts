import { boolean, jsonb, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { user } from "./users";
import { organization } from "./organization";
import { timestampString, timestampStringNullable } from "./customTypes";

export const visitorIdentities = createTable(
  "visitor_identities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    anonymousUserId: text("anonymous_user_id")
      .notNull()
      .references(() => user.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    externalId: varchar("external_id", { length: 255 }),
    email: varchar("email", { length: 255 }),
    name: varchar("name", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    hmacVerified: boolean("hmac_verified").default(false).notNull(),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
    deletedAt: timestampStringNullable("deleted_at"),
  },
  (table) => ({
    uniqueVisitorOrg: uniqueIndex("visitor_identities_user_org_unique").on(
      table.anonymousUserId,
      table.organizationId,
    ),
  }),
);
