import { index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { timestampString, timestampStringNullable } from "./customTypes";
import { participantRoleEnum } from "./enums/participantRoleEnum";
import { conversations } from "./conversations";
import { user } from "./users";
import { messages } from "./messages";

export const conversationParticipants = createTable(
  "conversation_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: participantRoleEnum("role").notNull(),
    lastReadMessageId: uuid("last_read_message_id").references(
      () => messages.id,
      { onDelete: "set null" },
    ),
    joinedAt: timestampString("joined_at")
      .default(sql`now()`)
      .notNull(),
    leftAt: timestampStringNullable("left_at"),
  },
  (table) => ({
    conversationIdx: index("participants_conversation_idx").on(
      table.conversationId,
    ),
    userIdx: index("participants_user_idx").on(table.userId),
    uniqueParticipant: uniqueIndex("participants_unique").on(
      table.conversationId,
      table.userId,
    ),
  }),
);
