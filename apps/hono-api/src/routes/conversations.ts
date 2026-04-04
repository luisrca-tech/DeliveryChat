import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations } from "../db/schema/conversations.js";
import { messages } from "../db/schema/messages.js";
import { conversationParticipants } from "../db/schema/conversationParticipants.js";
import { user } from "../db/schema/users.js";
import {
  listConversationsQuerySchema,
  getMessagesQuerySchema,
  createInternalConversationSchema,
  updateConversationStatusSchema,
  addParticipantSchema,
} from "./schemas/conversations.js";
import {
  createConversation,
  closeConversation,
  addParticipant,
  getConversationWithParticipants,
  ApplicationRequiredError,
} from "../features/chat/chat.service.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { createTenantRateLimitMiddleware } from "../lib/middleware/rateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const conversationsRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .use("*", createTenantRateLimitMiddleware())

  // GET / — list conversations
  .get("/", zValidator("query", listConversationsQuerySchema), async (c) => {
    try {
      const { organization } = getTenantAuth(c);
      const { limit, offset, status, type, applicationId } =
        c.req.valid("query");

      const conditions = [eq(conversations.organizationId, organization.id)];
      if (status) conditions.push(eq(conversations.status, status));
      if (type) conditions.push(eq(conversations.type, type));
      if (applicationId)
        conditions.push(eq(conversations.applicationId, applicationId));

      const result = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(and(...conditions));

      return c.json({
        conversations: result,
        total: countRow?.count ?? 0,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Error listing conversations:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // GET /:id — get conversation with participants
  .get("/:id", async (c) => {
    try {
      const { organization } = getTenantAuth(c);
      const conversationId = c.req.param("id");

      const result = await getConversationWithParticipants(
        conversationId,
        organization.id,
      );

      if (!result) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          ERROR_MESSAGES.NOT_FOUND,
          "Conversation not found",
        );
      }

      return c.json({ conversation: result });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  })

  // GET /:id/messages — paginated message history
  .get(
    "/:id/messages",
    zValidator("query", getMessagesQuerySchema),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);
        const conversationId = c.req.param("id");
        const { limit, offset } = c.req.valid("query");

        // Verify conversation belongs to this organization
        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.organizationId, organization.id),
            ),
          )
          .limit(1);

        if (!conv) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found",
          );
        }

        const result = await db
          .select({
            id: messages.id,
            conversationId: messages.conversationId,
            senderId: messages.senderId,
            senderName: user.name,
            type: messages.type,
            content: messages.content,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .leftJoin(user, eq(messages.senderId, user.id))
          .where(
            and(
              eq(messages.conversationId, conversationId),
              isNull(messages.deletedAt),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(limit)
          .offset(offset);

        return c.json({ messages: result, limit, offset });
      } catch (error) {
        console.error("Error fetching messages:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // POST / — create internal conversation
  .post(
    "/",
    requireRole("admin"),
    zValidator("json", createInternalConversationSchema),
    async (c) => {
      try {
        const { organization, user: authUser } = getTenantAuth(c);
        const { subject, applicationId, participantUserIds } =
          c.req.valid("json");

        const participants = [
          ...participantUserIds.map((userId: string) => ({
            userId,
            role: "operator" as const,
          })),
          { userId: authUser.id, role: "admin" as const },
        ];

        const conversation = await createConversation({
          organizationId: organization.id,
          applicationId,
          type: "internal",
          subject,
          participants,
        });

        return c.json({ conversation }, 201);
      } catch (error) {
        if (error instanceof ApplicationRequiredError) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.BAD_REQUEST,
            error.message,
          );
        }
        console.error("Error creating conversation:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // PATCH /:id/status — close or archive conversation
  .patch(
    "/:id/status",
    requireRole("admin"),
    zValidator("json", updateConversationStatusSchema),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);
        const conversationId = c.req.param("id");
        const { status } = c.req.valid("json");

        if (status === "closed") {
          const updated = await closeConversation(
            conversationId,
            organization.id,
          );
          if (!updated) {
            return jsonError(
              c,
              HTTP_STATUS.NOT_FOUND,
              ERROR_MESSAGES.NOT_FOUND,
              "Conversation not found",
            );
          }
          return c.json({ conversation: updated });
        }

        // Archive
        const [updated] = await db
          .update(conversations)
          .set({
            status: "archived",
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.organizationId, organization.id),
            ),
          )
          .returning();

        if (!updated) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found",
          );
        }

        return c.json({ conversation: updated });
      } catch (error) {
        console.error("Error updating conversation status:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )

  // POST /:id/participants — add participant (admin escalation)
  .post(
    "/:id/participants",
    requireRole("admin"),
    zValidator("json", addParticipantSchema),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);
        const conversationId = c.req.param("id");
        const { userId, role } = c.req.valid("json");

        // Verify conversation belongs to this org
        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.organizationId, organization.id),
            ),
          )
          .limit(1);

        if (!conv) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Conversation not found",
          );
        }

        const participant = await addParticipant({
          conversationId,
          userId,
          role,
        });

        return c.json({ participant }, 201);
      } catch (error) {
        // Unique constraint violation = participant already exists
        if (
          error instanceof Error &&
          error.message.includes("unique")
        ) {
          return jsonError(
            c,
            HTTP_STATUS.CONFLICT,
            ERROR_MESSAGES.CONFLICT,
            "User is already a participant",
          );
        }
        console.error("Error adding participant:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  );
