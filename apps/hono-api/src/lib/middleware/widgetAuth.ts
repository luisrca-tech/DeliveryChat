import type { MiddlewareHandler } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { applications } from "../../db/schema/applications.js";
import { matchesAllowedOrigin } from "../security/originMatcher.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";

export type WidgetAuthContext = {
  application: { id: string; domain: string; allowedOrigins: string[] };
  organizationId: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function requireWidgetAuth(): MiddlewareHandler {
  return async (c, next) => {
    const appId = c.req.header("X-App-Id")?.trim();
    if (!appId) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Missing X-App-Id header",
      );
    }

    if (!isValidUuid(appId)) {
      return jsonError(
        c,
        HTTP_STATUS.NOT_FOUND,
        ERROR_MESSAGES.NOT_FOUND,
        "Application not found",
      );
    }

    const [application] = await db
      .select({
        id: applications.id,
        domain: applications.domain,
        allowedOrigins: applications.allowedOrigins,
        organizationId: applications.organizationId,
      })
      .from(applications)
      .where(and(eq(applications.id, appId), isNull(applications.deletedAt)))
      .limit(1);

    if (!application) {
      return jsonError(
        c,
        HTTP_STATUS.NOT_FOUND,
        ERROR_MESSAGES.NOT_FOUND,
        "Application not found",
      );
    }

    const origin = c.req.header("Origin");

    if (origin) {
      const allowed = matchesAllowedOrigin(origin, {
        allowedOrigins: application.allowedOrigins,
        testMode: process.env.NODE_ENV !== "production",
      });
      if (!allowed) {
        return jsonError(
          c,
          HTTP_STATUS.FORBIDDEN,
          "origin_not_allowed",
          "Origin is not in the application allow-list",
        );
      }
    }

    c.set("widgetAuth", {
      application: {
        id: application.id,
        domain: application.domain,
        allowedOrigins: application.allowedOrigins,
      },
      organizationId: application.organizationId,
    } satisfies WidgetAuthContext);

    await next();
  };
}

export function getWidgetAuth(c: {
  get: (key: string) => unknown;
}): WidgetAuthContext | null {
  return (c.get("widgetAuth") ?? null) as WidgetAuthContext | null;
}
