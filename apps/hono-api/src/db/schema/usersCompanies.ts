import { timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { companies } from "./companies";
import { users } from "./users";

export const usersCompanies = createTable(
  "users_companies",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    role: varchar("role", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: { primaryKey: { columns: [table.userId, table.companyId] } },
  })
);
