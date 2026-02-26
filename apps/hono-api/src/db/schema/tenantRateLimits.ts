import { boolean, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { organization } from "./organization";

export const tenantRateLimits = createTable("tenant_rate_limits", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  requestsPerSecond: integer("requests_per_second"),
  requestsPerMinute: integer("requests_per_minute"),
  requestsPerHour: integer("requests_per_hour"),
  alertThresholdPercent: integer("alert_threshold_percent")
    .notNull()
    .default(80),
  isCustom: boolean("is_custom").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
