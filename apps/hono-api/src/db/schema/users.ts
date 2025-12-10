import { uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table.js";

export const users = createTable("users", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
});
