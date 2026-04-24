import type { MiddlewareHandler } from "hono";
import {
  verifyApiKey,
  touchLastUsed,
} from "../../features/api-keys/api-key.service.js";
import { enforceOrigin } from "../security/originMatcher.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";
import type { ResolvedApplication } from "./resolveApplication.js";

const KEY_REGEX = /^dk_(live|test)_[a-zA-Z0-9]{32}$/;

export type ApiAuthContext = {
  application: ResolvedApplication;
  apiKey: { id: string; environment: "live" | "test" };
};

export function requireApiKeyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const rawKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!rawKey) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Missing or invalid Authorization header",
      );
    }

    if (!KEY_REGEX.test(rawKey)) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Invalid API key format",
      );
    }

    const appId = c.req.header("X-App-Id")?.trim();
    if (!appId) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Missing X-App-Id header",
      );
    }

    const result = await verifyApiKey(rawKey);

    if (!result.valid) {
      const message =
        result.reason === "revoked"
          ? "API key has been revoked"
          : result.reason === "expired"
            ? "API key has expired"
            : "Invalid API key";
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        message,
      );
    }

    if (result.application.id !== appId) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "X-App-Id does not match API key",
      );
    }

    const originCheck = enforceOrigin({
      origin: c.req.header("Origin"),
      allowedOrigins: result.application.allowedOrigins,
      keyEnvironment: result.apiKey.environment,
      requireOrigin: true,
    });
    if (!originCheck.allowed) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        originCheck.error,
        originCheck.message,
      );
    }

    c.set("apiAuth", {
      application: result.application,
      apiKey: result.apiKey,
    } satisfies ApiAuthContext);

    touchLastUsed(result.apiKey.id);

    await next();
  };
}

export function getApiAuth(c: {
  get: (key: string) => unknown;
}): ApiAuthContext | null {
  return (c.get("apiAuth") ?? null) as ApiAuthContext | null;
}
