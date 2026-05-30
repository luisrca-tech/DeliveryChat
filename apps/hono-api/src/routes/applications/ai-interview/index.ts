import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../../../lib/middleware/auth.js";
import { checkBillingStatus } from "../../../lib/middleware/billing.js";
import { requireAiFeature } from "../../../features/ai/ai.middleware.js";
import {
  getInterviewContext,
  runGenerateSummary,
  runInterviewComplete,
  runInterviewTurn,
} from "../../../features/ai/ai.interview.stateMachine.js";
import { ERROR_MESSAGES, HTTP_STATUS, jsonError } from "../../../lib/http.js";
import { completeBodySchema, turnsBodySchema } from "./schemas.js";
import {
  findOwnedApplication,
  getInterviewProvider,
  getUserName,
  mapInterviewError,
} from "./helpers.js";

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

      if (row.status === "completed") {
        const completedByName = row.completedBy
          ? await getUserName(row.completedBy)
          : null;
        return c.json({
          status: row.status,
          summaryStatus: row.summaryStatus,
          currentTurn: row.currentTurn,
          interviewLog: row.interviewLog,
          contextSummary: row.contextSummary,
          completedBy: row.completedBy,
          completedByName,
          completedAt: row.completedAt,
        });
      }

      return c.json({
        status: row.status,
        summaryStatus: row.summaryStatus,
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

      try {
        const { row, output, canFinish } = await runInterviewTurn({
          provider: getInterviewProvider(),
          applicationId,
          tenantId: organization.id,
          userId: authUser.id,
          message: message ?? "",
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
        return mapInterviewError(c, error, "ai-interview turn");
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
        const { row } = await runInterviewComplete({
          applicationId,
          userId: authUser.id,
          expectedCurrentTurn,
        });

        return c.json({
          status: row.status,
          summaryStatus: row.summaryStatus,
          currentTurn: row.currentTurn,
          completedBy: row.completedBy,
          completedAt: row.completedAt,
        });
      } catch (error) {
        return mapInterviewError(c, error, "ai-interview complete");
      }
    },
  )
  .post(
    "/:applicationId/ai-interview/generate-summary",
    requireTenantAuth(),
    requireRole("admin"),
    checkBillingStatus(),
    requireAiFeature("interview"),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const { organization, user: authUser } = getTenantAuth(c);

      const app = await findOwnedApplication(applicationId, organization.id);
      if (!app) {
        return jsonError(c, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
      }

      try {
        const { row } = await runGenerateSummary({
          provider: getInterviewProvider(),
          applicationId,
          tenantId: organization.id,
          userId: authUser.id,
        });

        return c.json({
          status: row.status,
          summaryStatus: row.summaryStatus,
          contextSummary: row.contextSummary,
          aiEnabled: true,
        });
      } catch (error) {
        return mapInterviewError(c, error, "ai-interview generate-summary");
      }
    },
  );
