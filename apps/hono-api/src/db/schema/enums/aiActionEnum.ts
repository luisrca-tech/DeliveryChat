import { pgEnum } from "drizzle-orm/pg-core";

export const aiActionEnum = pgEnum("ai_action", [
  "generate",
  "improve",
  "interview",
  "interview_summary",
  "interview_forced_completion",
]);
