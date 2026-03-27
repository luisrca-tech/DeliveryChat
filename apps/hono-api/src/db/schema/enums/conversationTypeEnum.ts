import { pgEnum } from "drizzle-orm/pg-core";

export const conversationTypeEnum = pgEnum("conversation_type", [
  "support",
  "internal",
]);
