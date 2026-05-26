import { relations } from "drizzle-orm";
import { conversations } from "./conversations";
import { messages } from "./messages";
import { conversationParticipants } from "./conversationParticipants";
import { organization } from "./organization";
import { applications } from "./applications";
import { user } from "./users";
import { visitorIdentities } from "./visitorIdentities";
import { aiUsageLog } from "./aiUsageLog";

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [conversations.organizationId],
      references: [organization.id],
    }),
    application: one(applications, {
      fields: [conversations.applicationId],
      references: [applications.id],
    }),
    messages: many(messages),
    participants: many(conversationParticipants),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(user, {
    fields: [messages.senderId],
    references: [user.id],
  }),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(user, {
      fields: [conversationParticipants.userId],
      references: [user.id],
    }),
    lastReadMessage: one(messages, {
      fields: [conversationParticipants.lastReadMessageId],
      references: [messages.id],
    }),
  }),
);

export const visitorIdentitiesRelations = relations(
  visitorIdentities,
  ({ one }) => ({
    user: one(user, {
      fields: [visitorIdentities.anonymousUserId],
      references: [user.id],
    }),
    organization: one(organization, {
      fields: [visitorIdentities.organizationId],
      references: [organization.id],
    }),
  }),
);

export const aiUsageLogRelations = relations(aiUsageLog, ({ one }) => ({
  organization: one(organization, {
    fields: [aiUsageLog.tenantId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [aiUsageLog.userId],
    references: [user.id],
  }),
  conversation: one(conversations, {
    fields: [aiUsageLog.conversationId],
    references: [conversations.id],
  }),
}));
