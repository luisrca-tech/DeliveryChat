import { index, integer, text, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { timestampString } from "./customTypes";
import { aiActionEnum } from "./enums/aiActionEnum";
import { aiUsageStatusEnum } from "./enums/aiUsageStatusEnum";
import { organization } from "./organization";
import { user } from "./users";
import { conversations } from "./conversations";

export const aiUsageLog = createTable(
  "ai_usage_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: aiActionEnum("action").notNull(),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    model: varchar("model", { length: 255 }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    finishReason: varchar("finish_reason", { length: 50 }),
    status: aiUsageStatusEnum("status").notNull(),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    tenantCreatedIdx: index("ai_usage_log_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  }),
);
