import { timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { companies } from "./companies";
import { users } from "./users";

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
