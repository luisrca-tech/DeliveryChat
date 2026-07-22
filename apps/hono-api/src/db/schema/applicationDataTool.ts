import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { timestampString, timestampStringNullable } from "./customTypes";
import { dataSourceKindEnum } from "./enums/dataSourceKindEnum";
import { applications } from "./applications";

type HttpDataToolConfig = {
  method: "GET";
  urlTemplate: string;
};

type SqlDataToolConfig = {
  query: string;
};

export type DataToolConfig = HttpDataToolConfig | SqlDataToolConfig;

export const applicationDataTool = createTable(
  "application_data_tool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema").notNull(),
    backingType: dataSourceKindEnum("backing_type").notNull(),
    config: jsonb("config").$type<DataToolConfig>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    lastTestedAt: timestampStringNullable("last_tested_at"),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    applicationNameUniqueIdx: uniqueIndex(
      "application_data_tool_application_name_unique",
    ).on(table.applicationId, table.name),
    applicationIdx: index("application_data_tool_application_idx").on(
      table.applicationId,
    ),
  }),
);
