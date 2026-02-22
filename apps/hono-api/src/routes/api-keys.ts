import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema/apiKeys.js";
import { applications } from "../db/schema/applications.js";
import {
  revokeApiKey,
  regenerateApiKey,
} from "../features/api-keys/api-key.service.js";
import { regenerateApiKeySchema } from "./schemas/api-keys.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

export const apiKeysRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .use("*", requireRole("admin"))
  .delete("/:keyId", async (c) => {
    try {
      const keyId = c.req.param("keyId");
      const { organization } = getTenantAuth(c);

      const [row] = await db
        .select({
          keyId: apiKeys.id,
          organizationId: applications.organizationId,
        })
        .from(apiKeys)
        .innerJoin(applications, eq(apiKeys.applicationId, applications.id))
        .where(eq(apiKeys.id, keyId))
        .limit(1);

      if (!row || row.organizationId !== organization.id) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const revoked = await revokeApiKey(keyId);
      if (!revoked) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }
      return c.json({ success: true }, 200);
    } catch (error) {
      console.error("Error revoking API key:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  })
  .post(
    "/:keyId/regenerate",
    zValidator("json", regenerateApiKeySchema),
    async (c) => {
      try {
        const keyId = c.req.param("keyId");
        const { organization } = getTenantAuth(c);
        const { name, expiresAt } = c.req.valid("json");

        const [existing] = await db
          .select({ applicationId: apiKeys.applicationId })
          .from(apiKeys)
          .innerJoin(applications, eq(apiKeys.applicationId, applications.id))
          .where(eq(apiKeys.id, keyId))
          .limit(1);

        if (!existing) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
        }

        const [app] = await db
          .select()
          .from(applications)
          .where(eq(applications.id, existing.applicationId))
          .limit(1);

        if (!app || app.organizationId !== organization.id) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
        }

        const result = await regenerateApiKey(keyId, { name, expiresAt });
        if (!result) {
          return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
        }

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
        console.error("Error regenerating API key:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  );
