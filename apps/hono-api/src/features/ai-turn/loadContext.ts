import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";
import { messages } from "../../db/schema/messages.js";
import { organization } from "../../db/schema/organization.js";
import { applications } from "../../db/schema/applications.js";
import { applicationAiContext } from "../../db/schema/applicationAiContext.js";
import { applicationDataSource } from "../../db/schema/applicationDataSource.js";
import { applicationDataTool } from "../../db/schema/applicationDataTool.js";
import type {
  DataSourceRow,
  DataToolRow,
} from "../ai-data/index.js";
import type { MessageAuthorType } from "../chat/chat.service.js";

export type TurnConversation = {
  id: string;
  organizationId: string;
  applicationId: string;
  status: string;
  handledBy: string;
  assignedTo: string | null;
  createdBy: string | null;
  subject: string | null;
  createdAt: string;
};

export type TurnOrganization = {
  id: string;
  name: string;
  plan: string;
  aiAddonActive: boolean;
};

export type TurnApplication = {
  id: string;
  aiEnabled: boolean;
  aiAutoRespond: boolean;
  aiDbEnabled: boolean;
};

export type TurnContext = {
  conversation: TurnConversation;
  organization: TurnOrganization;
  application: TurnApplication;
};

/**
 * Load the conversation together with its org + application in one round-trip.
 * Returns null when the conversation does not exist or is not linked to an
 * application (an AI turn is impossible without an application).
 */
export async function loadTurnContext(
  conversationId: string,
): Promise<TurnContext | null> {
  const [row] = await db
    .select({
      convId: conversations.id,
      organizationId: conversations.organizationId,
      applicationId: conversations.applicationId,
      status: conversations.status,
      handledBy: conversations.handledBy,
      assignedTo: conversations.assignedTo,
      createdBy: conversations.createdBy,
      subject: conversations.subject,
      createdAt: conversations.createdAt,
      orgId: organization.id,
      orgName: organization.name,
      plan: organization.plan,
      aiAddonActive: organization.aiAddonActive,
      appId: applications.id,
      aiEnabled: applications.aiEnabled,
      aiAutoRespond: applications.aiAutoRespond,
      aiDbEnabled: applications.aiDbEnabled,
    })
    .from(conversations)
    .innerJoin(organization, eq(organization.id, conversations.organizationId))
    .innerJoin(applications, eq(applications.id, conversations.applicationId))
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!row) return null;

  return {
    conversation: {
      id: row.convId,
      organizationId: row.organizationId,
      applicationId: row.appId,
      status: row.status,
      handledBy: row.handledBy,
      assignedTo: row.assignedTo,
      createdBy: row.createdBy,
      subject: row.subject,
      createdAt: row.createdAt,
    },
    organization: {
      id: row.orgId,
      name: row.orgName,
      plan: row.plan,
      aiAddonActive: row.aiAddonActive,
    },
    application: {
      id: row.appId,
      aiEnabled: row.aiEnabled,
      aiAutoRespond: row.aiAutoRespond,
      aiDbEnabled: row.aiDbEnabled,
    },
  };
}

export type TurnMessage = {
  authorType: MessageAuthorType;
  senderId: string | null;
  content: string;
  contentFormat: string | null;
  createdAt: string;
};

/** Latest `limit` non-deleted messages, returned oldest → newest. */
export async function loadConversationMessages(
  conversationId: string,
  limit: number,
): Promise<TurnMessage[]> {
  const rows = await db
    .select({
      authorType: messages.authorType,
      senderId: messages.senderId,
      content: messages.content,
      contentFormat: messages.contentFormat,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.reverse() as TurnMessage[];
}

export type TurnToolset = {
  source: DataSourceRow;
  tools: (DataToolRow & { id: string; description: string })[];
};

/**
 * Load the application's enabled data source and enabled tools. Returns null
 * when no enabled source exists (data tools cannot execute without one) — the
 * turn still runs with only the escalate tool.
 */
export async function loadDataToolset(
  applicationId: string,
): Promise<TurnToolset | null> {
  const [source] = await db
    .select({
      kind: applicationDataSource.kind,
      config: applicationDataSource.config,
    })
    .from(applicationDataSource)
    .where(
      and(
        eq(applicationDataSource.applicationId, applicationId),
        eq(applicationDataSource.enabled, true),
      ),
    )
    .limit(1);

  if (!source) return null;

  const tools = await db
    .select({
      id: applicationDataTool.id,
      name: applicationDataTool.name,
      description: applicationDataTool.description,
      backingType: applicationDataTool.backingType,
      inputSchema: applicationDataTool.inputSchema,
      config: applicationDataTool.config,
    })
    .from(applicationDataTool)
    .where(
      and(
        eq(applicationDataTool.applicationId, applicationId),
        eq(applicationDataTool.enabled, true),
      ),
    );

  return {
    source: source as DataSourceRow,
    tools: tools as TurnToolset["tools"],
  };
}

/** Completed AI business-context summary for the application, if any. */
export async function loadContextSummary(
  applicationId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ contextSummary: applicationAiContext.contextSummary })
    .from(applicationAiContext)
    .where(
      and(
        eq(applicationAiContext.applicationId, applicationId),
        eq(applicationAiContext.status, "completed"),
      ),
    )
    .limit(1);

  return row?.contextSummary ?? undefined;
}
