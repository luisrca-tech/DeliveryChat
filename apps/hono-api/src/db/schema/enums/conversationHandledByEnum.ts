import { pgEnum } from "drizzle-orm/pg-core";

export const conversationHandledByEnum = pgEnum("conversation_handled_by", [
  "ai",
  "human",
]);
