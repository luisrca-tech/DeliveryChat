import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organization } from "../../db/schema/organization.js";
import {
  requireWidgetAuth,
  getWidgetAuth,
} from "../../lib/middleware/widgetAuth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import { upsertVisitorIdentity } from "./identity.service.js";
import { verifyHmac } from "./hmac.service.js";

const identifyBodySchema = z
  .object({
    name: z.string().max(255).optional(),
    email: z.string().email().max(255).optional(),
    externalId: z.string().max(255).optional(),
    metadata: z.record(z.unknown()).optional(),
    hmac: z.string().max(128).optional(),
  })
  .refine(
    (data) => data.name || data.email || data.externalId || data.metadata,
    {
      message:
        "At least one identity field (name, email, externalId, or metadata) is required",
    },
  );

export const identifyRoute = new Hono().post(
  "/identify",
  requireWidgetAuth(),
  zValidator("json", identifyBodySchema),
  async (c) => {
    const widgetAuth = getWidgetAuth(c);
    if (!widgetAuth) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
      );
    }

    const visitorId = c.req.header("X-Visitor-Id")?.trim();
    if (!visitorId) {
      return jsonError(
        c,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.BAD_REQUEST,
        "X-Visitor-Id header required",
      );
    }

    const body = c.req.valid("json");

    const [org] = await db
      .select({
        identityVerificationEnabled: organization.identityVerificationEnabled,
        identityVerificationSecret: organization.identityVerificationSecret,
      })
      .from(organization)
      .where(eq(organization.id, widgetAuth.organizationId))
      .limit(1);

    let hmacVerified = false;

    if (org?.identityVerificationEnabled) {
      if (!body.hmac || !body.externalId) {
        return jsonError(
          c,
          HTTP_STATUS.FORBIDDEN,
          ERROR_MESSAGES.FORBIDDEN,
          "Identity verification is enabled. Both externalId and hmac are required.",
        );
      }
      if (!org.identityVerificationSecret) {
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "Identity verification secret not configured",
        );
      }
      const valid = verifyHmac(
        org.identityVerificationSecret,
        body.externalId,
        body.hmac,
      );
      if (!valid) {
        return jsonError(
          c,
          HTTP_STATUS.FORBIDDEN,
          ERROR_MESSAGES.FORBIDDEN,
          "Invalid HMAC signature",
        );
      }
      hmacVerified = true;
    }

    try {
      const identity = await upsertVisitorIdentity({
        anonymousUserId: visitorId,
        organizationId: widgetAuth.organizationId,
        externalId: body.externalId,
        email: body.email,
        name: body.name,
        metadata: body.metadata,
        hmacVerified,
      });

      return c.json({ identity }, 200);
    } catch (error) {
      console.error("Error upserting visitor identity:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      );
    }
  },
);
