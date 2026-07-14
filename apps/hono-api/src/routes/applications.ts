import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { applications } from "../db/schema/applications.js";
import { applicationAiContext } from "../db/schema/applicationAiContext.js";
import { conversations } from "../db/schema/conversations.js";
import { deriveAiInterviewStatus } from "../features/applications/aiInterviewStatus.js";
import {
  createApplicationSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
} from "./schemas/applications.js";
import { createApiKeySchema } from "./schemas/apiKeys.js";
import {
  createApiKey,
  listApiKeys,
  ApiKeyLimitError,
  assertApiKeyEnvironmentMatchesApp,
  ApiKeyEnvironmentMismatchError,
} from "../features/api-keys/api-key.service.js";
import {
  ApplicationDomainConflictError,
  ApplicationPortConflictError,
  createApplication,
  getApplication,
  updateApplication,
  deleteApplication,
  countActiveApiKeys,
} from "../features/applications/application.service.js";
import { getApiKeyLimitByPlan } from "../lib/planLimits.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { createTenantRateLimitMiddleware } from "../lib/middleware/rateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const applicationsRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .use("*", createTenantRateLimitMiddleware())
  .get("/", zValidator("query", listApplicationsQuerySchema), async (c) => {
    try {
      const { organization, user: authUser } = getTenantAuth(c);

      const { limit, offset, hasMyConversations } = c.req.valid("query");

      if (hasMyConversations) {
        const rows = await db
          .selectDistinct({
            id: applications.id,
            name: applications.name,
            domain: applications.domain,
            allowedOrigins: applications.allowedOrigins,
            description: applications.description,
            organizationId: applications.organizationId,
            settings: applications.settings,
            deletedAt: applications.deletedAt,
            createdAt: applications.createdAt,
            updatedAt: applications.updatedAt,
            kind: applications.kind,
            port: applications.port,
            aiContextStatus: applicationAiContext.status,
          })
          .from(applications)
          .innerJoin(
            conversations,
            eq(applications.id, conversations.applicationId),
          )
          .leftJoin(
            applicationAiContext,
            eq(applications.id, applicationAiContext.applicationId),
          )
          .where(
            and(
              eq(applications.organizationId, organization.id),
              isNull(applications.deletedAt),
              eq(conversations.assignedTo, authUser.id),
            ),
          )
          .limit(limit)
          .offset(offset);

        const applicationsResult = rows.map(({ aiContextStatus, ...app }) => ({
          ...app,
          aiInterviewStatus: deriveAiInterviewStatus(aiContextStatus),
        }));

        return c.json({ applications: applicationsResult, limit, offset });
      }

      const result = await db
        .select({
          id: applications.id,
          name: applications.name,
          domain: applications.domain,
          allowedOrigins: applications.allowedOrigins,
          description: applications.description,
          organizationId: applications.organizationId,
          settings: applications.settings,
          deletedAt: applications.deletedAt,
          createdAt: applications.createdAt,
          updatedAt: applications.updatedAt,
          kind: applications.kind,
          port: applications.port,
          aiContextStatus: applicationAiContext.status,
        })
        .from(applications)
        .leftJoin(
          applicationAiContext,
          eq(applications.id, applicationAiContext.applicationId),
        )
        .where(
          and(
            eq(applications.organizationId, organization.id),
            isNull(applications.deletedAt),
          ),
        )
        .limit(limit)
        .offset(offset);

      const applicationsResult = result.map(({ aiContextStatus, ...app }) => ({
        ...app,
        aiInterviewStatus: deriveAiInterviewStatus(aiContextStatus),
      }));

      return c.json({
        applications: applicationsResult,
        limit,
        offset,
      });
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

        const newApp = await createApplication(organization.id, data);
        return c.json({ application: newApp }, 201);
      } catch (error) {
        if (error instanceof ApplicationPortConflictError) {
          return c.json(
            {
              error: "PORT_TAKEN",
              message: error.message,
              port: error.port,
              conflictingAppName: error.conflictingAppName,
            },
            HTTP_STATUS.CONFLICT,
          );
        }
        if (error instanceof ApplicationDomainConflictError) {
          return c.json(
            {
              error: "DOMAIN_TAKEN",
              message: "Domain already exists",
            },
            HTTP_STATUS.CONFLICT,
          );
        }
        console.error("Error creating application:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
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

      const [aiContext] = await db
        .select({ status: applicationAiContext.status })
        .from(applicationAiContext)
        .where(eq(applicationAiContext.applicationId, appId))
        .limit(1);

      const activeApiKeysCount = await countActiveApiKeys(appId);

      return c.json({
        application: {
          ...app,
          aiInterviewStatus: deriveAiInterviewStatus(aiContext?.status ?? null),
        },
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

        assertApiKeyEnvironmentMatchesApp(app.kind, data.environment);

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
        if (error instanceof ApiKeyEnvironmentMismatchError) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.BAD_REQUEST,
            error.message,
          );
        }
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
