import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { member } from "../db/schema/member.js";
import { listUsersQuerySchema } from "./schemas/users.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const usersRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .get(
    "/users",
    zValidator("query", listUsersQuerySchema),
    requireRole("admin"),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);

        const orgMembers = await db
          .select({ userId: member.userId })
          .from(member)
          .where(eq(member.organizationId, organization.id));

        const userIds = [...new Set(orgMembers.map((m) => m.userId))];

        if (userIds.length === 0) {
          return c.json({ users: [], limit: 0, offset: 0 });
        }

        const { limit, offset } = c.req.valid("query");
        const result = await db
          .select()
          .from(user)
          .where(inArray(user.id, userIds))
          .limit(limit)
          .offset(offset);

        return c.json({ users: result, limit, offset });
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
  );
