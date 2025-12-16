import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { member } from "../../db/schema/member.js";
import { jsonError } from "../http.js";
import { getHostSubdomain, resolveOrganizationBySubdomain } from "../tenant.js";

type MembershipRow = typeof member.$inferSelect;

type AuthContext = {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  organization: Awaited<
    ReturnType<typeof resolveOrganizationBySubdomain>
  > extends infer T
    ? NonNullable<T>
    : never;
  membership: MembershipRow;
};

export function requireTenantAuth(): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session?.user) {
      return jsonError(c, 401, "Unauthorized");
    }

    const host = c.req.header("host") ?? null;
    const subdomain = getHostSubdomain(host);

    if (!subdomain) {
      return jsonError(c, 403, "Forbidden", "Tenant subdomain not found");
    }

    const org = await resolveOrganizationBySubdomain(subdomain);
    if (!org) {
      return jsonError(c, 403, "Forbidden", "Tenant not found");
    }

    const memberships = await db
      .select()
      .from(member)
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, org.id)
        )
      )
      .limit(1);

    const membership = memberships[0];
    if (!membership) {
      return jsonError(
        c,
        403,
        "Forbidden",
        "You are not a member of this organization"
      );
    }

    c.set("auth", {
      session,
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
  minRole: "operator" | "admin" | "owner"
): MiddlewareHandler {
  const rank: Record<string, number> = { operator: 1, admin: 2, owner: 3 };
  return async (c, next) => {
    const { membership } = getTenantAuth(c);
    const current = rank[membership.role] ?? 0;
    const required = rank[minRole] ?? 0;
    if (current < required) {
      return jsonError(c, 403, "Forbidden", "Insufficient role");
    }
    await next();
  };
}
