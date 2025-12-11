import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/index.js";
import { applications } from "../db/schema/applications.js";
import {
  createApplicationSchema,
  listApplicationsQuerySchema,
} from "./schemas/applications.js";

export const applicationsRoute = new Hono()
  // GET /applications - list applications
  .get(
    "/applications",
    zValidator("query", listApplicationsQuerySchema),
    async (c) => {
      try {
        const { limit, offset } = c.req.valid("query");
        const result = await db
          .select()
          .from(applications)
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
  // POST /applications - create application
  .post(
    "/applications",
    zValidator("json", createApplicationSchema),
    async (c) => {
      try {
        const data = c.req.valid("json");
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
