import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { rateLimitEvents } from "../db/schema/rateLimitEvents.js";
import { tenantRateLimits } from "../db/schema/tenantRateLimits.js";
import {
  getTenantAuth,
  requireRole,
  requireTenantAuth,
} from "../lib/middleware/auth.js";
import { checkBillingStatus } from "../lib/middleware/billing.js";
import { createTenantRateLimitMiddleware } from "../lib/middleware/rateLimit.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import { getRateLimitsForTenant } from "../features/rate-limiting/rateLimitConfig.service.js";
import { updateRateLimitsSchema } from "./schemas/rateLimits.js";
import { zValidator } from "@hono/zod-validator";

const RECENT_EVENTS_LIMIT = 50;

export const rateLimitsRoute = new Hono()
  .use("*", requireTenantAuth())
  .use("*", checkBillingStatus())
  .use("*", createTenantRateLimitMiddleware())
  .get("/", async (c) => {
    try {
      const { organization } = getTenantAuth(c);
      const limits = await getRateLimitsForTenant(
        organization.id,
        organization.plan,
      );

      const [overrides] = await db
        .select()
        .from(tenantRateLimits)
        .where(eq(tenantRateLimits.tenantId, organization.id))
        .limit(1);

      const recentEvents = await db
        .select()
        .from(rateLimitEvents)
        .where(eq(rateLimitEvents.tenantId, organization.id))
        .orderBy(desc(rateLimitEvents.createdAt))
        .limit(RECENT_EVENTS_LIMIT);

      return c.json({
        limits: {
          perSecond: limits.perSecond,
          perMinute: limits.perMinute,
          perHour: limits.perHour,
        },
        overrides: overrides
          ? {
              requestsPerSecond: overrides.requestsPerSecond,
              requestsPerMinute: overrides.requestsPerMinute,
              requestsPerHour: overrides.requestsPerHour,
              isCustom: overrides.isCustom,
            }
          : null,
        plan: organization.plan,
        canConfigure: organization.plan === "ENTERPRISE",
        recentEvents: recentEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          window: e.window,
          limitValue: e.limitValue,
          currentCount: e.currentCount,
          createdAt: e.createdAt?.toISOString() ?? null,
        })),
      });
    } catch (error) {
      console.error("Error fetching rate limits:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  })
  .put(
    "/",
    zValidator("json", updateRateLimitsSchema),
    requireRole("admin"),
    async (c) => {
      try {
        const { organization } = getTenantAuth(c);

        if (organization.plan !== "ENTERPRISE") {
          return jsonError(
            c,
            HTTP_STATUS.FORBIDDEN,
            ERROR_MESSAGES.FORBIDDEN,
            "Custom rate limits are only available for ENTERPRISE plans",
          );
        }

        const body = c.req.valid("json");

        const updateSet: Record<string, unknown> = {
          isCustom: true,
          updatedAt: new Date(),
        };
        if (body.requestsPerSecond !== undefined)
          updateSet.requestsPerSecond = body.requestsPerSecond;
        if (body.requestsPerMinute !== undefined)
          updateSet.requestsPerMinute = body.requestsPerMinute;
        if (body.requestsPerHour !== undefined)
          updateSet.requestsPerHour = body.requestsPerHour;

        await db
          .insert(tenantRateLimits)
          .values({
            tenantId: organization.id,
            requestsPerSecond: body.requestsPerSecond ?? null,
            requestsPerMinute: body.requestsPerMinute ?? null,
            requestsPerHour: body.requestsPerHour ?? null,
            alertThresholdPercent: 80,
            isCustom: true,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: tenantRateLimits.tenantId,
            set: updateSet as Record<string, unknown>,
          });

        const limits = await getRateLimitsForTenant(
          organization.id,
          organization.plan,
        );

        return c.json({
          success: true,
          limits: {
            perSecond: limits.perSecond,
            perMinute: limits.perMinute,
            perHour: limits.perHour,
          },
        });
      } catch (error) {
        console.error("Error updating rate limits:", error);
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  );
