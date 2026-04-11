import type { Context, MiddlewareHandler } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { applications } from "../../db/schema/applications.js";
import { validateOrigin } from "../../features/api-keys/api-key.service.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";

export type WidgetAuthContext = {
  application: { id: string; domain: string };
  organizationId: string;
};

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" || url.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

async function resolveOrigin(c: Context): Promise<string | null> {
  const headerOrigin = c.req.header("Origin");
  if (headerOrigin) return headerOrigin;

  try {
    const body = await c.req.json();
    if (body && typeof body.origin === "string") {
      return body.origin;
    }
  } catch {
    // No JSON body or parsing failed — that's fine
  }

  return null;
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

    const [application] = await db
      .select({
        id: applications.id,
        domain: applications.domain,
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

    const origin = await resolveOrigin(c);

    if (origin) {
      if (!isLocalhostOrigin(origin)) {
        if (!validateOrigin(origin, application.domain)) {
          return jsonError(
            c,
            HTTP_STATUS.FORBIDDEN,
            ERROR_MESSAGES.FORBIDDEN,
            "Domain not allowed",
          );
        }
      }
    }

    c.set("widgetAuth", {
      application: { id: application.id, domain: application.domain },
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
