import { pgEnum } from "drizzle-orm/pg-core";

export const rateLimitEventTypeEnum = pgEnum("rate_limit_event_type", [
  "EXCEEDED",
  "ALERT_SENT",
]);
