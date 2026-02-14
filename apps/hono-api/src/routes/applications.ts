import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { applications } from "../db/schema/applications.js";
import {
  createApplicationSchema,
  listApplicationsQuerySchema,
} from "./schemas/applications.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const applicationsRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .get("/", zValidator("query", listApplicationsQuerySchema), async (c) => {
    try {
      const { organization } = getTenantAuth(c);

      const { limit, offset } = c.req.valid("query");
      const result = await db
        .select()
        .from(applications)
        .where(eq(applications.organizationId, organization.id))
        .limit(limit)
        .offset(offset);

      return c.json({ applications: result, limit, offset });
    } catch (error) {
      console.error("Error fetching applications:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  })
  .post(
    "/",
    zValidator("json", createApplicationSchema),
    requireRole("admin"),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);
        const data = c.req.valid("json");

        const [newApp] = await db
          .insert(applications)
          .values({
            ...data,
            organizationId: organization.id,
            id: crypto.randomUUID(),
          })
          .returning();
        return c.json({ application: newApp }, 201);
      } catch (error) {
        console.error("Error creating application:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  );
