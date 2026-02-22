import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { applications } from "../db/schema/applications.js";
import {
  createApplicationSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
} from "./schemas/applications.js";
import { createApiKeySchema } from "./schemas/api-keys.js";
import {
  createApiKey,
  listApiKeys,
  ApiKeyLimitError,
} from "../features/api-keys/api-key.service.js";
import {
  getApplication,
  updateApplication,
  deleteApplication,
  countActiveApiKeys,
  ApplicationDomainConflictError,
  isUniqueViolation,
} from "../features/applications/application.service.js";
import { getApiKeyLimitByPlan } from "../lib/plan-limits.js";
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
        .where(
          and(
            eq(applications.organizationId, organization.id),
            isNull(applications.deletedAt),
          ),
        )
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
        if (
          error instanceof ApplicationDomainConflictError ||
          isUniqueViolation(error)
        ) {
          return jsonError(
            c,
            HTTP_STATUS.CONFLICT,
            ERROR_MESSAGES.CONFLICT,
            "Domain already exists",
          );
        }
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
  .get("/:id", requireRole("admin"), async (c) => {
    try {
      const appId = c.req.param("id");
      const { organization } = getTenantAuth(c);

      const app = await getApplication(appId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const activeApiKeysCount = await countActiveApiKeys(appId);

      return c.json({
        application: app,
        activeApiKeysCount,
      });
    } catch (error) {
      console.error("Error fetching application:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  })
  .patch(
    "/:id",
    zValidator("json", updateApplicationSchema),
    requireRole("admin"),
    async (c) => {
      try {
        const appId = c.req.param("id");
        const { organization } = getTenantAuth(c);
        const data = c.req.valid("json");

        const updated = await updateApplication(appId, organization.id, data);
        if (!updated) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
        }

        return c.json({ application: updated });
      } catch (error) {
        console.error("Error updating application:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  )
  .delete("/:id", requireRole("admin"), async (c) => {
    try {
      const appId = c.req.param("id");
      const { organization } = getTenantAuth(c);

      const deleted = await deleteApplication(appId, organization.id);
      if (!deleted) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      return c.body(null, 204);
    } catch (error) {
      console.error("Error deleting application:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  })
  .get("/:id/api-keys", requireRole("admin"), async (c) => {
    try {
      const appId = c.req.param("id");
      const { organization } = getTenantAuth(c);

      const app = await getApplication(appId, organization.id);
      if (!app) {
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

        const app = await getApplication(appId, organization.id);
        if (!app) {
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
