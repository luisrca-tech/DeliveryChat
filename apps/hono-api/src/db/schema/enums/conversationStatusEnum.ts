import { pgEnum } from "drizzle-orm/pg-core";

export const conversationStatusEnum = pgEnum("conversation_status", [
  "pending",
  "active",
  "closed",
]);
