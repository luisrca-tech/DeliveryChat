import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { member } from "../../db/schema/member.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../http.js";
import { getHostSubdomain, resolveOrganizationBySubdomain } from "../tenant.js";

type MembershipRow = typeof member.$inferSelect;

type AuthContext = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  user: { id: string };
  organization: Awaited<
    ReturnType<typeof resolveOrganizationBySubdomain>
  > extends infer T
    ? NonNullable<T>
    : never;
  membership: MembershipRow;
};

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
type SessionWithUser = SessionResult & {
  user?: { id: string };
  data?: { user?: { id: string } };
};

export function requireTenantAuth(): MiddlewareHandler {
  return async (c, next) => {
    const sessionResult = (await auth.api.getSession({
      headers: c.req.raw.headers,
    })) as SessionWithUser | null;

    const user = sessionResult?.user ?? sessionResult?.data?.user ?? null;

    if (!user?.id) {
      return jsonError(
        c,
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHORIZED
      );
    }

    const host = c.req.header("host") ?? null;
    const subdomain = getHostSubdomain(host);

    if (!subdomain) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        ERROR_MESSAGES.FORBIDDEN,
        "Tenant subdomain not found"
      );
    }

    const org = await resolveOrganizationBySubdomain(subdomain);
    if (!org) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        ERROR_MESSAGES.FORBIDDEN,
        "Tenant not found"
      );
    }

    const memberships = await db
      .select()
      .from(member)
      .where(and(eq(member.userId, user.id), eq(member.organizationId, org.id)))
      .limit(1);

    const membership = memberships[0];
    if (!membership) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        ERROR_MESSAGES.FORBIDDEN,
        "You are not a member of this organization"
      );
    }

    c.set("auth", {
      session: sessionResult,
      user,
      organization: org,
      membership,
    } satisfies AuthContext);

    await next();
  };
}

export function getTenantAuth(c: {
  get: (key: string) => unknown;
}): AuthContext {
  return (c.get("auth") ?? null) as AuthContext;
}

export function requireRole(
  minRole: "operator" | "admin" | "super_admin"
): MiddlewareHandler {
  const rank: Record<string, number> = {
    operator: 1,
    admin: 2,
    super_admin: 3,
  };
  return async (c, next) => {
    const { membership } = getTenantAuth(c);
    const current = rank[membership.role] ?? 0;
    const required = rank[minRole] ?? 0;
    if (current < required) {
      return jsonError(
        c,
        HTTP_STATUS.FORBIDDEN,
        ERROR_MESSAGES.FORBIDDEN,
        "Insufficient role"
      );
    }
    await next();
  };
}
