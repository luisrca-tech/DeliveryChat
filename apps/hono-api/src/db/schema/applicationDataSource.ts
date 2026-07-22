import { sql } from "drizzle-orm";
import { boolean, jsonb, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { timestampString } from "./customTypes";
import { dataSourceKindEnum } from "./enums/dataSourceKindEnum";
import { applications } from "./applications";

type HttpDataSourceConfig = {
  baseUrl: string;
  allowedHost: string;
  encryptedHeaders?: Record<string, string>;
};

type SqlDataSourceConfig = {
  encryptedConnectionString: string;
};

export type DataSourceConfig = HttpDataSourceConfig | SqlDataSourceConfig;

export const applicationDataSource = createTable(
  "application_data_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: dataSourceKindEnum("kind").notNull(),
    config: jsonb("config").$type<DataSourceConfig>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    applicationUniqueIdx: uniqueIndex(
      "application_data_source_application_unique",
    ).on(table.applicationId),
  }),
);
