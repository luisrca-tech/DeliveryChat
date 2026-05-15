import type { MiddlewareHandler } from "hono";
import { auth } from "../auth.js";
import { db } from "../../db/index.js";
import { member } from "../../db/schema/member.js";
import { user } from "../../db/schema/users.js";
import { and, eq } from "drizzle-orm";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";
import { getHostSubdomain, resolveOrganizationBySubdomain } from "../tenant.js";
import {
  getTenantSlugFromExplicitHeader,
  getTenantSlugFromHeaders,
} from "../requestContext.js";
import {
  resolveLoginOutcome,
  getStatusSpecificErrorMessage,
} from "../accountLifecycle.js";
import {
  verifyApiKey,
  touchLastUsed,
} from "../../features/api-keys/api-key.service.js";
import { enforceOrigin } from "../security/originMatcher.js";
import { resolveOrCreateVisitor } from "../../features/chat/visitor.service.js";
import type { ResolvedApplication } from "./resolveApplication.js";

const KEY_REGEX = /^dk_(live|test)_[a-zA-Z0-9]{32}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AuthMembership = {
  id: string;
  role: string;
  userId: string;
  organizationId: string;
};

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

type MemberAuthContext = {
  type: "member";
  session: SessionResult;
  user: { id: string; name: string };
  organization: NonNullable<
    Awaited<ReturnType<typeof resolveOrganizationBySubdomain>>
  >;
  membership: AuthMembership;
};

type VisitorAuthContext = {
  type: "visitor";
  visitorId: string;
  visitorUserId: string;
  application: ResolvedApplication;
  apiKey: { id: string; environment: "live" | "test" };
};

export type UnifiedAuthContext = MemberAuthContext | VisitorAuthContext;

type SessionWithUser = SessionResult & {
  user?: { id: string };
  data?: { user?: { id: string } };
};

async function trySessionAuth(
  headers: Headers,
): Promise<MemberAuthContext | null> {
  const sessionResult = (await auth.api.getSession({
    headers,
  })) as SessionWithUser | null;

  const sessionUser =
    sessionResult?.user ?? sessionResult?.data?.user ?? null;

  if (!sessionUser?.id) return null;

  const users = await db
    .select({ id: user.id, name: user.name, status: user.status })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);
  const dbUser = users[0];
  if (!dbUser) return null;

  const loginOutcome = resolveLoginOutcome(dbUser);
  if (loginOutcome !== "ALLOW") return null;

  const explicitTenant = getTenantSlugFromExplicitHeader(headers);
  const derivedTenant =
    getTenantSlugFromHeaders(headers) ??
    getHostSubdomain(headers.get("host"));

  if (explicitTenant && derivedTenant && explicitTenant !== derivedTenant) {
    return null;
  }

  const subdomain = explicitTenant ?? derivedTenant;
  if (!subdomain) return null;

  const org = await resolveOrganizationBySubdomain(subdomain);
  if (!org) return null;

  const memberships = await db
    .select({
      id: member.id,
      role: member.role,
      userId: member.userId,
      organizationId: member.organizationId,
    })
    .from(member)
    .where(
      and(
        eq(member.userId, sessionUser.id),
        eq(member.organizationId, org.id),
      ),
    )
    .limit(1);

  const membership = memberships[0];
  if (!membership) return null;

  return {
    type: "member",
    session: sessionResult,
    user: { id: sessionUser.id, name: dbUser.name },
    organization: org,
    membership,
  };
}

export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const memberCtx = await trySessionAuth(c.req.raw.headers);

    if (memberCtx) {
      c.set("unifiedAuth", memberCtx);
      await next();
      return;
    }

    const authHeader = c.req.header("Authorization");
    const rawKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!rawKey) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED,
        "Missing credentials",
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

    const visitorId = c.req.header("X-Visitor-Id")?.trim();
    if (!visitorId) {
      return jsonError(
        c,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.BAD_REQUEST,
        "X-Visitor-Id header required",
      );
    }

    if (!UUID_REGEX.test(visitorId)) {
      return jsonError(
        c,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_MESSAGES.BAD_REQUEST,
        "X-Visitor-Id must be a valid UUID",
      );
    }

    const visitorUserId = await resolveOrCreateVisitor(visitorId);

    touchLastUsed(result.apiKey.id);

    c.set("unifiedAuth", {
      type: "visitor",
      visitorId,
      visitorUserId,
      application: result.application,
      apiKey: result.apiKey,
    } satisfies VisitorAuthContext);

    await next();
  };
}

export function getUnifiedAuth(c: {
  get: (key: string) => unknown;
}): UnifiedAuthContext {
  return c.get("unifiedAuth") as UnifiedAuthContext;
}

export function requireMember(): MiddlewareHandler {
  return async (c, next) => {
    const authCtx = getUnifiedAuth(c);

    if (authCtx.type !== "member") {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        ERROR_MESSAGES.FORBIDDEN,
        "This endpoint requires member authentication",
      );
    }

    await next();
  };
}
