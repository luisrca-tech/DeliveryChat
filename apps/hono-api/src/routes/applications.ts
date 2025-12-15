import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { applications } from "../db/schema/applications.js";
import { member } from "../db/schema/member.js";
import {
  createApplicationSchema,
  listApplicationsQuerySchema,
} from "./schemas/applications.js";

export const applicationsRoute = new Hono()
  // GET /applications - list applications (filtered by user's organizations)
  .get(
    "/applications",
    zValidator("query", listApplicationsQuerySchema),
    async (c) => {
      try {
        // Get session from Better Auth
        const session = await auth.api.getSession({
          headers: c.req.raw.headers,
        });

        if (!session?.user) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        // Get user's organization memberships
        const userMemberships = await db
          .select({ organizationId: member.organizationId })
          .from(member)
          .where(eq(member.userId, session.user.id));

        if (userMemberships.length === 0) {
          return c.json({ applications: [], limit: 0, offset: 0 });
        }

        const organizationIds = userMemberships.map((m) => m.organizationId);

        // Filter applications by user's organizations
        const { limit, offset } = c.req.valid("query");
        const result = await db
          .select()
          .from(applications)
          .where(inArray(applications.organizationId, organizationIds))
          .limit(limit)
          .offset(offset);

        return c.json({ applications: result, limit, offset });
      } catch (error) {
        console.error("Error fetching applications:", error);
        return c.json(
          {
            error: "Failed to fetch applications",
            message: error instanceof Error ? error.message : "Unknown error",
          },
          500
        );
      }
    }
  )
  // POST /applications - create application (requires organization membership)
  .post(
    "/applications",
    zValidator("json", createApplicationSchema),
    async (c) => {
      try {
        // Get session from Better Auth
        const session = await auth.api.getSession({
          headers: c.req.raw.headers,
        });

        if (!session?.user) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        const data = c.req.valid("json");

        // Verify user is a member of the organization
        const membership = await db
          .select()
          .from(member)
          .where(
            and(
              eq(member.userId, session.user.id),
              eq(member.organizationId, data.organizationId)
            )
          )
          .limit(1);

        if (membership.length === 0) {
          return c.json(
            {
              error: "Forbidden",
              message: "You are not a member of this organization",
            },
            403
          );
        }

        const [newApp] = await db
          .insert(applications)
          .values({ ...data, id: crypto.randomUUID() })
          .returning();
        return c.json({ application: newApp }, 201);
      } catch (error) {
        console.error("Error creating application:", error);
        return c.json(
          {
            error: "Failed to create application",
            message: error instanceof Error ? error.message : "Unknown error",
          },
          500
        );
      }
    }
  );
