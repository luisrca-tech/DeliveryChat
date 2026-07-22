import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../../../lib/middleware/auth.js";
import { checkBillingStatus } from "../../../lib/middleware/billing.js";
import { requireAiAddon } from "../../../features/ai/ai.middleware.js";
import { ERROR_MESSAGES, HTTP_STATUS, jsonError } from "../../../lib/http.js";
import { encryptSecret } from "../../../lib/crypto/secretBox.js";
import {
  executeDataTool,
  validateSqlQuery,
} from "../../../features/ai-data/index.js";
import type { DataSourceConfig } from "../../../db/schema/applicationDataSource.js";
import {
  dataSourceBodySchema,
  dataToolBodySchema,
  enableBodySchema,
  testRequestBodySchema,
} from "./schemas.js";
import {
  redactDataSource,
  serializeDataTool,
  truncateTestData,
} from "./helpers.js";
import {
  createDataTool,
  deleteDataTool,
  findOwnedApplication,
  getDataSource,
  getDataTool,
  listDataTools,
  markToolTested,
  setToolEnabled,
  updateDataTool,
  upsertDataSource,
} from "./dataAccess.js";

// All routes are gated by requireAiAddon: the AI add-on entitlement
// (plan ∈ {PREMIUM, ENTERPRISE} AND organization.aiAddonActive) — the same
// gate as the rest of the AI feature, for both HTTP- and SQL-backed tools.

type HttpSourceConfig = {
  baseUrl: string;
  allowedHost: string;
  encryptedHeaders?: Record<string, string>;
};
type SqlSourceConfig = { encryptedConnectionString: string };

export const dataToolsRoute = new Hono()
  // 1. GET data-source — redacted (no secrets) or null.
  .get(
    "/:applicationId/data-source",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization } = getTenantAuth(c);

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const source = await getDataSource(applicationId);
      if (!source) return c.json(null);
      return c.json(redactDataSource(source));
    },
  )
  // 2. PUT data-source — upsert; secrets encrypted at rest, write-only.
  .put(
    "/:applicationId/data-source",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    checkBillingStatus(),
    zValidator("json", dataSourceBodySchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization } = getTenantAuth(c);
      const body = c.req.valid("json");

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const existing = await getDataSource(applicationId);
      let config: DataSourceConfig;

      if (body.kind === "http") {
        const previousHeaders =
          existing?.kind === "http"
            ? (existing.config as HttpSourceConfig).encryptedHeaders
            : undefined;
        const encryptedHeaders =
          body.headers !== undefined
            ? encryptHeaders(body.headers)
            : previousHeaders;
        config = {
          baseUrl: body.baseUrl,
          allowedHost: body.allowedHost,
          ...(encryptedHeaders ? { encryptedHeaders } : {}),
        };
      } else {
        const previousConnection =
          existing?.kind === "sql"
            ? (existing.config as SqlSourceConfig).encryptedConnectionString
            : undefined;
        const encryptedConnectionString =
          body.connectionString !== undefined
            ? encryptSecret(body.connectionString)
            : previousConnection;
        if (!encryptedConnectionString) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.VALIDATION_ERROR,
            "connectionString is required when creating a SQL data source",
          );
        }
        config = { encryptedConnectionString };
      }

      const saved = await upsertDataSource({
        applicationId,
        kind: body.kind,
        config,
      });
      return c.json(redactDataSource(saved));
    },
  )
  // 3. GET data-tools — list (config carries no secrets).
  .get(
    "/:applicationId/data-tools",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization } = getTenantAuth(c);

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const tools = await listDataTools(applicationId);
      return c.json(tools.map(serializeDataTool));
    },
  )
  // 4. POST data-tools — create (always disabled).
  .post(
    "/:applicationId/data-tools",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    checkBillingStatus(),
    zValidator("json", dataToolBodySchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization } = getTenantAuth(c);
      const body = c.req.valid("json");

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const gate = await ensureToolMatchesSource(
        applicationId,
        body.backingType,
      );
      if (!gate.ok) return jsonError(c, gate.status, gate.error, gate.message);

      if (body.backingType === "sql") {
        const sqlCheck = validateSqlQuery(body.config.query);
        if (!sqlCheck.ok) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.VALIDATION_ERROR,
            sqlCheck.error,
          );
        }
      }

      try {
        const created = await createDataTool({
          applicationId,
          name: body.name,
          description: body.description,
          inputSchema: body.inputSchema,
          backingType: body.backingType,
          config: body.config,
        });
        return c.json(serializeDataTool(created), 201);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return jsonError(
            c,
            HTTP_STATUS.CONFLICT,
            ERROR_MESSAGES.CONFLICT,
            "A tool with this name already exists for this application",
          );
        }
        throw error;
      }
    },
  )
  // 5. PUT data-tools/:toolId — update; resets enabled + lastTestedAt.
  .put(
    "/:applicationId/data-tools/:toolId",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    checkBillingStatus(),
    zValidator("json", dataToolBodySchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const toolId = c.req.param("toolId");
      const { organization } = getTenantAuth(c);
      const body = c.req.valid("json");

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const gate = await ensureToolMatchesSource(
        applicationId,
        body.backingType,
      );
      if (!gate.ok) return jsonError(c, gate.status, gate.error, gate.message);

      if (body.backingType === "sql") {
        const sqlCheck = validateSqlQuery(body.config.query);
        if (!sqlCheck.ok) {
          return jsonError(
            c,
            HTTP_STATUS.BAD_REQUEST,
            ERROR_MESSAGES.VALIDATION_ERROR,
            sqlCheck.error,
          );
        }
      }

      const updated = await updateDataTool({
        toolId,
        applicationId,
        name: body.name,
        description: body.description,
        inputSchema: body.inputSchema,
        backingType: body.backingType,
        config: body.config,
      });
      if (!updated) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }
      return c.json(serializeDataTool(updated));
    },
  )
  // 6. DELETE data-tools/:toolId — hard delete (config data, not user data).
  .delete(
    "/:applicationId/data-tools/:toolId",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const toolId = c.req.param("toolId");
      const { organization } = getTenantAuth(c);

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const deleted = await deleteDataTool(toolId, applicationId);
      if (!deleted) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }
      return c.json({ deleted: true });
    },
  )
  // 7. POST data-tools/:toolId/test — run against the live source.
  .post(
    "/:applicationId/data-tools/:toolId/test",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    checkBillingStatus(),
    zValidator("json", testRequestBodySchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const toolId = c.req.param("toolId");
      const { organization } = getTenantAuth(c);
      const { params } = c.req.valid("json");

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const tool = await getDataTool(toolId, applicationId);
      if (!tool) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const source = await getDataSource(applicationId);
      if (!source) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.VALIDATION_ERROR,
          "No data source is configured for this application",
        );
      }

      const result = await executeDataTool({
        applicationId,
        tool: {
          name: tool.name,
          backingType: tool.backingType,
          inputSchema: tool.inputSchema,
          config: tool.config,
        },
        source: { kind: source.kind, config: source.config },
        params,
      });

      // A failed test is a normal outcome — return 200 with the failure body.
      if (!result.ok) {
        return c.json({ ok: false, error: result.error, kind: result.kind });
      }

      await markToolTested(toolId, applicationId);
      return c.json({ ok: true, ...truncateTestData(result.data) });
    },
  )
  // 8. POST data-tools/:toolId/enable — gated on a prior successful test.
  .post(
    "/:applicationId/data-tools/:toolId/enable",
    requireTenantAuth(),
    requireRole("admin"),
    requireAiAddon(),
    checkBillingStatus(),
    zValidator("json", enableBodySchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const toolId = c.req.param("toolId");
      const { organization } = getTenantAuth(c);
      const { enabled } = c.req.valid("json");

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const tool = await getDataTool(toolId, applicationId);
      if (!tool) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      if (enabled && !tool.lastTestedAt) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_MESSAGES.VALIDATION_ERROR,
          "tool must pass a test request before enabling",
        );
      }

      const updated = await setToolEnabled(toolId, applicationId, enabled);
      if (!updated) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }
      return c.json(serializeDataTool(updated));
    },
  );

function encryptHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const encrypted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    encrypted[name] = encryptSecret(value);
  }
  return encrypted;
}

/**
 * A tool's `backingType` must match the configured source `kind`; otherwise the
 * tool could never execute. Returns a discriminated gate result.
 */
async function ensureToolMatchesSource(
  applicationId: string,
  backingType: "http" | "sql",
): Promise<
  { ok: true } | { ok: false; status: 400; error: string; message: string }
> {
  const source = await getDataSource(applicationId);
  if (!source) {
    return {
      ok: false,
      status: HTTP_STATUS.BAD_REQUEST,
      error: ERROR_MESSAGES.VALIDATION_ERROR,
      message: "Configure a data source before adding tools",
    };
  }
  if (source.kind !== backingType) {
    return {
      ok: false,
      status: HTTP_STATUS.BAD_REQUEST,
      error: ERROR_MESSAGES.VALIDATION_ERROR,
      message: `backingType "${backingType}" does not match the data source kind "${source.kind}"`,
    };
  }
  return { ok: true };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
