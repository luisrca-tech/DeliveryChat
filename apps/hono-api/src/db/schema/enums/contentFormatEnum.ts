import { pgEnum } from "drizzle-orm/pg-core";

export const contentFormatEnum = pgEnum("content_format", ["plain", "lexical"]);
