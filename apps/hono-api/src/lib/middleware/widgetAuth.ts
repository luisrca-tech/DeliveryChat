import type { MiddlewareHandler } from "hono";
import { resolveApplicationById } from "./resolveApplication.js";
import { enforceOrigin } from "../security/originMatcher.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";

export type WidgetAuthContext = {
  application: { id: string; domain: string; allowedOrigins: string[] };
  organizationId: string;
};

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

    const application = await resolveApplicationById(appId);

    if (!application) {
      return jsonError(
        c,
        HTTP_STATUS.NOT_FOUND,
        ERROR_MESSAGES.NOT_FOUND,
        "Application not found",
      );
    }

    const originCheck = enforceOrigin({
      origin: c.req.header("Origin"),
      allowedOrigins: application.allowedOrigins,
    });
    if (!originCheck.allowed) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        originCheck.error,
        originCheck.message,
      );
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
