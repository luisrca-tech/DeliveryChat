import { pgEnum } from "drizzle-orm/pg-core";

export const messageAuthorTypeEnum = pgEnum("message_author_type", [
  "visitor",
  "operator",
  "ai",
  "system",
]);
