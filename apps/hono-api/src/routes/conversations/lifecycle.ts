import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { updateConversationSubjectSchema } from "./schemas.js";
import {
  acceptConversation,
  leaveConversation,
  resolveConversation,
  softDeleteConversation,
  updateConversationSubject,
  addParticipant,
} from "../../features/chat/chat.service.js";
import { mapServiceErrorToResponse } from "../../features/chat/error-mapper.js";
import {
  requireAuth,
  requireMember,
  getUnifiedAuth,
} from "../../lib/middleware/unifiedAuth.js";
import { checkBillingStatus } from "../../lib/middleware/billing.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";

export const lifecycleRoute = new Hono()

  .post(
    "/:id/accept",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");

        const updated = await acceptConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
        );

        try {
          await addParticipant({
            conversationId,
            userId: authUser.id,
            role: "operator",
          });
        } catch {
          // Already a participant — ignore
        }

        return c.json({ conversation: updated });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .post(
    "/:id/leave",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");

        const updated = await leaveConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
        );

        return c.json({ conversation: updated });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .post(
    "/:id/resolve",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");

        const updated = await resolveConversation(
          conversationId,
          organization.id,
          authUser.id,
          authUser.name,
        );

        return c.json({ conversation: updated });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .patch(
    "/:id/subject",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    zValidator("json", updateConversationSubjectSchema),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");
        const { organization, user: authUser } = auth;
        const conversationId = c.req.param("id");
        const { subject } = c.req.valid("json");

        const updated = await updateConversationSubject(
          conversationId,
          organization.id,
          authUser.id,
          subject,
        );

        return c.json({ conversation: updated });
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  )

  .delete(
    "/:id",
    requireAuth(),
    requireMember(),
    checkBillingStatus(),
    async (c) => {
      try {
        const auth = getUnifiedAuth(c);
        if (auth.type !== "member") throw new Error("unreachable");

        const isAdmin =
          auth.membership.role === "admin" ||
          auth.membership.role === "super_admin";
        if (!isAdmin) {
          return jsonError(
            c,
            HTTP_STATUS.FORBIDDEN,
            ERROR_MESSAGES.FORBIDDEN,
            "Insufficient role",
          );
        }

        const { organization } = auth;
        const conversationId = c.req.param("id");

        await softDeleteConversation(conversationId, organization.id);

        return c.body(null, 204);
      } catch (error) {
        const mapped = mapServiceErrorToResponse(c, error);
        if (mapped) return mapped;
        throw error;
      }
    },
  );
