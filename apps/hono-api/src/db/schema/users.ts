import { text, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import {
  emailVerifiedTimestamp,
  timestampString,
  timestampStringNullable,
} from "./customTypes";
import { statusEnum } from "./enums/statusEnum";

export const user = createTable("user", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  emailVerified: emailVerifiedTimestamp("email_verified"),
  image: varchar("image", { length: 500 }),
  status: statusEnum("status").notNull().default("PENDING_VERIFICATION"),
  pendingExpiresAt: timestampStringNullable("pending_expires_at"),
  expiredAt: timestampStringNullable("expired_at"),
  createdAt: timestampString("created_at")
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestampString("updated_at")
    .default(sql`now()`)
    .notNull(),
});
