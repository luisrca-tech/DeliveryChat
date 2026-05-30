import { pgEnum } from "drizzle-orm/pg-core";

export const summaryStatusEnum = pgEnum("summary_status", [
  "none",
  "pending",
  "ready",
  "failed",
]);
