import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { timestampString, timestampStringNullable } from "./customTypes";
import { aiContextStatusEnum } from "./enums/aiContextStatusEnum";
import { summaryStatusEnum } from "./enums/summaryStatusEnum";
import { applications } from "./applications";
import { user } from "./users";

export const applicationAiContext = createTable(
  "application_ai_context",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    status: aiContextStatusEnum("status").notNull().default("in_progress"),
    summaryStatus: summaryStatusEnum("summary_status")
      .notNull()
      .default("none"),
    interviewLog: jsonb("interview_log")
      .$type<
        Array<{
          role: "assistant" | "user";
          content: string;
          topicsCoveredThisTurn?: string[];
        }>
      >()
      .notNull()
      .default([]),
    currentTurn: integer("current_turn").notNull().default(0),
    contextSummary: text("context_summary"),
    completedBy: text("completed_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    completedAt: timestampStringNullable("completed_at"),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    applicationUniqueIdx: uniqueIndex(
      "application_ai_context_application_unique",
    ).on(table.applicationId),
    currentTurnCheck: check(
      "current_turn_check",
      sql`${table.currentTurn} >= 0 AND ${table.currentTurn} <= 15`,
    ),
  }),
);
