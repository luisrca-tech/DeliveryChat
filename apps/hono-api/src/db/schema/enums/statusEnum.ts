import { pgEnum } from "drizzle-orm/pg-core";

export const statusEnum = pgEnum("status", [
  "PENDING_VERIFICATION",
  "EXPIRED",
  "ACTIVE",
  "DELETED",
]);
