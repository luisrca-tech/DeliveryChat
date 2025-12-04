import { timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table.js";
import { companies } from "./companies.js";
import { users } from "./users.js";

export const usersCompanies = createTable(
  "users_companies",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    company_id: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    role: varchar("role", { length: 100 }),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: { primaryKey: { columns: [table.user_id, table.company_id] } },
  })
);
