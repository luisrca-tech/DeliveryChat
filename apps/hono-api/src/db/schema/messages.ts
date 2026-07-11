import { index, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createTable } from "../table";
import { timestampString, timestampStringNullable } from "./customTypes";
import { messageTypeEnum } from "./enums/messageTypeEnum";
import { messageAuthorTypeEnum } from "./enums/messageAuthorTypeEnum";
import { contentFormatEnum } from "./enums/contentFormatEnum";
import { conversations } from "./conversations";
import { user } from "./users";

export const messages = createTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: messageTypeEnum("type").notNull().default("text"),
    authorType: messageAuthorTypeEnum("author_type")
      .notNull()
      .default("visitor"),
    content: text("content").notNull(),
    contentFormat: contentFormatEnum("content_format").notNull().default("plain"),
    editedAt: timestampStringNullable("edited_at"),
    deletedAt: timestampStringNullable("deleted_at"),
    createdAt: timestampString("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestampString("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    conversationIdx: index("messages_conversation_idx").on(
      table.conversationId,
    ),
    conversationCreatedIdx: index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    senderIdx: index("messages_sender_idx").on(table.senderId),
  }),
);
