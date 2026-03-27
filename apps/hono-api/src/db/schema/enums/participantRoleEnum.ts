import { pgEnum } from "drizzle-orm/pg-core";

export const participantRoleEnum = pgEnum("participant_role", [
  "visitor",
  "operator",
  "admin",
]);
