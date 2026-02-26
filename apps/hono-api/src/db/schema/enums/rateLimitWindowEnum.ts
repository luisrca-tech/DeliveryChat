import { pgEnum } from "drizzle-orm/pg-core";

export const rateLimitWindowEnum = pgEnum("rate_limit_window", [
  "second",
  "minute",
  "hour",
]);
