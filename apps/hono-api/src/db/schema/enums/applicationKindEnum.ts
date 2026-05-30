import { pgEnum } from "drizzle-orm/pg-core";

export const applicationKindEnum = pgEnum("application_kind", [
  "production",
  "test",
]);
