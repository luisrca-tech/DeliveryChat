import { index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { organization } from "./organization";
import { rateLimitEventTypeEnum } from "./enums/rateLimitEventTypeEnum";
import { rateLimitWindowEnum } from "./enums/rateLimitWindowEnum";

export const rateLimitEvents = createTable(
  "rate_limit_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventType: rateLimitEventTypeEnum("event_type").notNull(),
    window: rateLimitWindowEnum("window").notNull(),
    limitValue: integer("limit_value").notNull(),
    currentCount: integer("current_count").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index("rate_limit_events_tenant_idx").on(table.tenantId),
    createdAtIdx: index("rate_limit_events_created_at_idx").on(table.createdAt),
  }),
);
