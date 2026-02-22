import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { applications } from "../db/schema/applications.js";
import {
  createApplicationSchema,
  listApplicationsQuerySchema,
} from "./schemas/applications.js";
import { createApiKeySchema } from "./schemas/api-keys.js";
import {
  createApiKey,
  listApiKeys,
  ApiKeyLimitError,
} from "../features/api-keys/api-key.service.js";
import { getApiKeyLimitByPlan } from "../lib/plan-limits.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import {
  jsonError,
  HTTP_STATUS,
  ERROR_MESSAGES,
} from "../lib/http.js";

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
  )
  .get("/:id/api-keys", requireRole("admin"), async (c) => {
    try {
      const appId = c.req.param("id");
      const { organization } = getTenantAuth(c);

      const [app] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, appId))
        .limit(1);

      if (!app || app.organizationId !== organization.id) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const keys = await listApiKeys(appId);
      const activeCount = keys.filter((k) => !k.revokedAt).length;
      const limit = getApiKeyLimitByPlan(organization.plan);

      return c.json({
        apiKeys: keys.map((k) => ({
          id: k.id,
          keyPrefix: `${k.keyPrefix}****`,
          name: k.name,
          environment: k.environment,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        })),
        limit,
        used: activeCount,
      });
    } catch (error) {
      console.error("Error listing API keys:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  })
  .post(
    "/:id/api-keys",
    zValidator("json", createApiKeySchema),
    requireRole("admin"),
    async (c) => {
      try {
        const appId = c.req.param("id");
        const { organization } = getTenantAuth(c);
        const data = c.req.valid("json");

        const [app] = await db
          .select()
          .from(applications)
          .where(eq(applications.id, appId))
          .limit(1);

        if (!app || app.organizationId !== organization.id) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
        }

        const maxKeys = getApiKeyLimitByPlan(organization.plan);
        const result = await createApiKey(
          {
            applicationId: appId,
            name: data.name,
            environment: data.environment,
            expiresAt: data.expiresAt,
          },
          maxKeys,
        );

        return c.json(
          {
            id: result.id,
            appId: result.applicationId,
            key: result.key,
            keyPrefix: result.keyPrefix,
            name: result.name,
            expiresAt: result.expiresAt?.toISOString() ?? null,
            createdAt: result.createdAt.toISOString(),
          },
          201,
        );
      } catch (error) {
        if (error instanceof ApiKeyLimitError) {
          return jsonError(
            c,
            HTTP_STATUS.TOO_MANY_REQUESTS,
            ERROR_MESSAGES.TOO_MANY_REQUESTS,
            error.message,
          );
        }
        console.error("Error creating API key:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  );
