import { timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table.js";

export const companies = createTable("companies", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  subdomain: varchar("subdomain", { length: 255 }).notNull().unique(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
