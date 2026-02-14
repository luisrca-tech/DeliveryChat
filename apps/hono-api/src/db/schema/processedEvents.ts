import { varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { timestampString } from "./customTypes";

export const processedEvents = createTable("processed_events", {
  id: varchar("id", { length: 255 }).primaryKey(),
  createdAt: timestampString("created_at")
    .default(sql`now()`)
    .notNull(),
});
