import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  requireTenantAuth,
  getTenantAuth,
  requireRole,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import {
  requireAiFeature,
  createAiRateLimitMiddleware,
} from "../features/ai/ai.middleware.js";
import {
  generateReplyBodySchema,
  improveMessageBodySchema,
  listAiUsageQuerySchema,
} from "../features/ai/ai.schemas.js";
import {
  generateReply,
  improveMessage,
  getAiUsageLogs,
} from "../features/ai/ai.service.js";
import { mapAiErrorToResponse } from "../features/ai/ai.errorMapper.js";
import { jsonError, HTTP_STATUS } from "../lib/http.js";

export const aiRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .get(
    "/usage",
    requireRole("admin"),
    zValidator("query", listAiUsageQuerySchema),
    async (c) => {
      const auth = getTenantAuth(c);
      const { limit, offset, action, status, userId, dateFrom, dateTo } =
        c.req.valid("query");

      const result = await getAiUsageLogs({
        tenantId: auth.organization.id,
        limit,
        offset,
        action,
        status,
        userId,
        dateFrom,
        dateTo,
      });

      return c.json({
        logs: result.logs,
        total: result.total,
        limit,
        offset,
      });
    },
  )
  .use("/generate-reply", requireRole("operator"))
  .use("/improve-message", requireRole("operator"))
  .use("/generate-reply", requireAiFeature())
  .use("/improve-message", requireAiFeature())
  .use("/generate-reply", createAiRateLimitMiddleware())
  .use("/improve-message", createAiRateLimitMiddleware())
  .post(
    "/generate-reply",
    zValidator("json", generateReplyBodySchema),
    async (c) => {
      const auth = getTenantAuth(c);
      const { conversationId } = c.req.valid("json");

      try {
        const result = await generateReply({
          conversationId,
          operatorId: auth.user.id,
          tenantId: auth.organization.id,
          tenantName: auth.organization.name,
        });

        return c.json({ text: result.text });
      } catch (error) {
        const mapped = mapAiErrorToResponse(c, error);
        if (mapped) return mapped;

        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          "internal_server_error",
          "An unexpected error occurred while generating a reply.",
        );
      }
    },
  )
  .post(
    "/improve-message",
    zValidator("json", improveMessageBodySchema),
    async (c) => {
      const auth = getTenantAuth(c);
      const { conversationId, draft } = c.req.valid("json");

      try {
        const result = await improveMessage({
          conversationId,
          draft,
          operatorId: auth.user.id,
          tenantId: auth.organization.id,
          tenantName: auth.organization.name,
        });

        return c.json({ text: result.text });
      } catch (error) {
        const mapped = mapAiErrorToResponse(c, error);
        if (mapped) return mapped;

        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          "internal_server_error",
          "An unexpected error occurred while improving the message.",
        );
      }
    },
  );
