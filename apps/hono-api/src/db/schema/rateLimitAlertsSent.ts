import { primaryKey, timestamp } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { organization } from "./organization";
import { rateLimitWindowEnum } from "./enums/rateLimitWindowEnum";
import { text } from "drizzle-orm/pg-core";

export const rateLimitAlertsSent = createTable(
  "rate_limit_alerts_sent",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    windowType: rateLimitWindowEnum("window_type").notNull(),
    lastSentAt: timestamp("last_sent_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.windowType] }),
  }),
);
