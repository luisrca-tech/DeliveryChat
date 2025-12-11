import { uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { tenants } from "./tenants";

export const users = createTable("users", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
});
