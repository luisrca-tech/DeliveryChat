import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db/index.js";
import { applications } from "../../../db/schema/applications.js";
import { env } from "../../../env.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../../../lib/middleware/auth.js";
import { checkBillingStatus } from "../../../lib/middleware/billing.js";
import { requireAiFeature } from "../../../features/ai/ai.middleware.js";
import { mapAiErrorToResponse } from "../../../features/ai/ai.errorMapper.js";
import {
  createAIProvider,
  type AIProvider,
} from "../../../features/ai/ai.provider.js";
import {
  getInterviewContext,
  MissingTopicsError,
  runAdvanceTurn,
  runBootstrapTurn,
  runCompleteInterview,
  TurnConflictError,
} from "../../../features/ai/ai.interviewer.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../../lib/http.js";
import { completeBodySchema, turnsBodySchema } from "./schemas.js";

let providerInstance: AIProvider | null = null;
function getProvider(): AIProvider {
  if (!providerInstance) {
    providerInstance = createAIProvider(
      env.AI_INTERVIEW_MODEL,
      env.GROQ_API_KEY,
    );
  }
  return providerInstance;
}

async function findOwnedApplication(
  applicationId: string,
  organizationId: string,
) {
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.organizationId, organizationId),
        isNull(applications.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export const aiInterviewRoute = new Hono()
  .get(
    "/:applicationId/ai-interview",
    requireTenantAuth(),
    requireRole("admin"),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization } = getTenantAuth(c);

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const row = await getInterviewContext(applicationId);
      if (!row) {
        return c.json({ status: "not_started" as const });
      }

      return c.json({
        status: row.status,
        currentTurn: row.currentTurn,
        interviewLog: row.interviewLog,
      });
    },
  )
  .post(
    "/:applicationId/ai-interview/turns",
    requireTenantAuth(),
    requireRole("admin"),
    checkBillingStatus(),
    requireAiFeature("interview"),
    zValidator("json", turnsBodySchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization, user: authUser } = getTenantAuth(c);
      const { message, expectedCurrentTurn } = c.req.valid("json");

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      const trimmedMessage = message?.trim() ?? "";
      const isBootstrap = expectedCurrentTurn === 0 && trimmedMessage === "";

      try {
        const { row, output, canFinish } = isBootstrap
          ? await runBootstrapTurn({
              provider: getProvider(),
              applicationId,
              tenantId: organization.id,
              userId: authUser.id,
            })
          : await runAdvanceTurn({
              provider: getProvider(),
              applicationId,
              tenantId: organization.id,
              userId: authUser.id,
              userMessage: trimmedMessage,
              expectedCurrentTurn,
            });

        return c.json({
          status: row.status,
          currentTurn: row.currentTurn,
          interviewLog: row.interviewLog,
          canFinish,
          turn: {
            intent: output.intent,
            topicsCoveredThisTurn: output.topicsCoveredThisTurn,
            guardrailAction: output.guardrailAction,
          },
        });
      } catch (error) {
        if (error instanceof TurnConflictError) {
          return c.json(
            {
              error: "turn_conflict",
              currentTurn: error.currentTurn,
              status: error.status,
            },
            HTTP_STATUS.CONFLICT,
          );
        }
        const mapped = mapAiErrorToResponse(c, error);
        if (mapped) return mapped;
        console.error("ai-interview bootstrap failed:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  )
  .post(
    "/:applicationId/ai-interview/complete",
    requireTenantAuth(),
    requireRole("admin"),
    checkBillingStatus(),
    requireAiFeature("interview"),
    zValidator("json", completeBodySchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization, user: authUser } = getTenantAuth(c);
      const { expectedCurrentTurn } = c.req.valid("json");

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      try {
        const { row } = await runCompleteInterview({
          applicationId,
          userId: authUser.id,
          expectedCurrentTurn,
        });

        return c.json({
          status: row.status,
          currentTurn: row.currentTurn,
          completedBy: row.completedBy,
          completedAt: row.completedAt,
        });
      } catch (error) {
        if (error instanceof TurnConflictError) {
          return c.json(
            {
              error: "turn_conflict",
              currentTurn: error.currentTurn,
              status: error.status,
            },
            HTTP_STATUS.CONFLICT,
          );
        }
        if (error instanceof MissingTopicsError) {
          return c.json(
            {
              error: error.code,
              missing: error.missing,
            },
            HTTP_STATUS.UNPROCESSABLE_ENTITY,
          );
        }
        console.error("ai-interview complete failed:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  );
