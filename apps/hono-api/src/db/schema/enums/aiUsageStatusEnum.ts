import { pgEnum } from "drizzle-orm/pg-core";

export const aiUsageStatusEnum = pgEnum("ai_usage_status", [
  "success",
  "provider_error",
  "timeout",
  "empty",
  "content_filtered",
  "aborted",
]);
