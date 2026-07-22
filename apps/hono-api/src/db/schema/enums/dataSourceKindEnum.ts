import { pgEnum } from "drizzle-orm/pg-core";

export const dataSourceKindEnum = pgEnum("data_source_kind", ["http", "sql"]);
