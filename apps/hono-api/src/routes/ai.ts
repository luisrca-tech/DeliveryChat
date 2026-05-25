import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireTenantAuth, getTenantAuth } from "../lib/middleware/auth.js";
import { requireRole } from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import {
  requireAiFeature,
  createAiRateLimitMiddleware,
} from "../features/ai/ai.middleware.js";
import { generateReplyBodySchema } from "../features/ai/ai.schemas.js";
import { generateReply } from "../features/ai/ai.service.js";
import { mapAiErrorToResponse } from "../features/ai/ai.errorMapper.js";
import { jsonError, HTTP_STATUS } from "../lib/http.js";

export const aiRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", requireRole("operator"))
  .use("*", checkBillingStatus())
  .use("*", requireAiFeature())
  .use("*", createAiRateLimitMiddleware())
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
  );
