import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { member } from "../db/schema/member.js";
import { invitation } from "../db/schema/invitation.js";
import { listUsersQuerySchema } from "./schemas/users.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { createTenantRateLimitMiddleware } from "../lib/middleware/rateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const usersRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .use("*", createTenantRateLimitMiddleware())
  .get(
    "/",
    zValidator("query", listUsersQuerySchema),
    async (c) => {
      try {
        const { organization, membership } = getTenantAuth(c);
        const { limit, offset } = c.req.valid("query");

        const members = await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            status: user.status,
            isAnonymous: user.isAnonymous,
            role: member.role,
            createdAt: user.createdAt,
          })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(eq(member.organizationId, organization.id))
          .limit(limit)
          .offset(offset);

        // Only admins see pending invitations
        const isAdmin =
          membership.role === "admin" || membership.role === "super_admin";

        const invitations = isAdmin
          ? await db
              .select({
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                status: invitation.status,
                expiresAt: invitation.expiresAt,
                createdAt: invitation.createdAt,
              })
              .from(invitation)
              .where(
                and(
                  eq(invitation.organizationId, organization.id),
                  ne(invitation.status, "accepted"),
                ),
              )
          : [];

        return c.json({ users: members, invitations, limit, offset });
      } catch (error) {
        console.error("Error fetching users:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  )
  .delete(
    "/invitations/:id",
    requireRole("admin"),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);
        const invitationId = c.req.param("id");

        const [deleted] = await db
          .delete(invitation)
          .where(
            and(
              eq(invitation.id, invitationId),
              eq(invitation.organizationId, organization.id),
              ne(invitation.status, "pending"),
            ),
          )
          .returning({ id: invitation.id });

        if (!deleted) {
          return jsonError(
            c,
            HTTP_STATUS.NOT_FOUND,
            ERROR_MESSAGES.NOT_FOUND,
            "Invitation not found or still pending",
          );
        }

        return c.json({ success: true });
      } catch (error) {
        console.error("Error deleting invitation:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )
  .patch(
    "/invitations/:id",
    requireRole("admin"),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);
        const invitationId = c.req.param("id");
        const body = await c.req.json<{ name?: string }>();

        const [updated] = await db
          .update(invitation)
          .set({ name: body.name ?? null })
          .where(
            and(
              eq(invitation.id, invitationId),
              eq(invitation.organizationId, organization.id),
            ),
          )
          .returning({ id: invitation.id });

        if (!updated) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
        }

        return c.json({ success: true });
      } catch (error) {
        console.error("Error updating invitation:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  );
