import { index, integer, text, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { organization } from "./organization";
import { timestampString, timestampStringNullable } from "./customTypes";
import { invoiceStatusEnum } from "./enums/invoiceStatusEnum";

export const invoices = createTable(
  "invoices",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("brl"),
    status: invoiceStatusEnum("status").notNull(),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    periodStart: timestampStringNullable("period_start"),
    periodEnd: timestampStringNullable("period_end"),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    organizationIdx: index("invoices_organization_idx").on(
      table.organizationId,
    ),
  }),
);
