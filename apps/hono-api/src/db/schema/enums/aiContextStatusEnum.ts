import { pgEnum } from "drizzle-orm/pg-core";

export const aiContextStatusEnum = pgEnum("ai_context_status", [
  "in_progress",
  "completed",
]);
