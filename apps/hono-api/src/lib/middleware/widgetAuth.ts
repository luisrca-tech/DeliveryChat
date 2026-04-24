import type { MiddlewareHandler } from "hono";
import {
  resolveAndEnforceOrigin,
  type ResolvedApplication,
} from "./resolveApplication.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";

export type WidgetAuthContext = {
  application: ResolvedApplication;
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

    const result = await resolveAndEnforceOrigin(appId, c.req.header("Origin"));

    if (!result.authorized) {
      return jsonError(c, result.status, result.error, result.message);
    }

    c.set("widgetAuth", {
      application: result.application,
      organizationId: result.application.organizationId,
    } satisfies WidgetAuthContext);

    const origin = c.req.header("Origin");
    if (origin) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
    }

    await next();
  };
}

export function getWidgetAuth(c: {
  get: (key: string) => unknown;
}): WidgetAuthContext | null {
  return (c.get("widgetAuth") ?? null) as WidgetAuthContext | null;
}
