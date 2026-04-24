import type { Context } from "hono";
import { auth } from "../auth.js";
import { enforceOrigin } from "../security/originMatcher.js";
import { resolveApplicationById } from "./resolveApplication.js";
import { db } from "../../db/index.js";
import { member } from "../../db/schema/member.js";
import { and, eq } from "drizzle-orm";
import { organization } from "../../db/schema/organization.js";
import type { ParticipantRole } from "@repo/types";

export interface AuthenticatedWSUser {
  userId: string;
  userName: string | null;
  organizationId: string;
  role: ParticipantRole;
  authType: "session" | "widget";
  applicationId?: string;
}

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
type SessionWithUser = SessionResult & {
  user?: { id: string; name?: string };
  data?: { user?: { id: string; name?: string } };
};

export async function authenticateWebSocket(
  c: Context,
): Promise<AuthenticatedWSUser | null> {
  const appId = c.req.query("appId");
  const visitorId = c.req.query("visitorId");

  if (appId && visitorId) {
    return authenticateWidget(c, appId, visitorId);
  }

  return authenticateWithSession(c);
}

async function authenticateWidget(
  c: Context,
  appId: string,
  visitorId: string,
): Promise<AuthenticatedWSUser | null> {
  const app = await resolveApplicationById(appId);

  if (!app) return null;

  const originCheck = enforceOrigin({
    origin: c.req.header("Origin"),
    allowedOrigins: app.allowedOrigins,
  });
  if (!originCheck.allowed) return null;

  return {
    userId: visitorId,
    userName: null,
    organizationId: app.organizationId,
    role: "visitor",
    authType: "widget",
    applicationId: appId,
  };
}

async function authenticateWithSession(
  c: Context,
): Promise<AuthenticatedWSUser | null> {
  const sessionToken = c.req.query("sessionToken");
  const headers = new Headers(c.req.raw.headers);
  if (sessionToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const sessionResult = (await auth.api.getSession({
    headers,
  })) as SessionWithUser | null;

  const sessionUser =
    sessionResult?.user ?? sessionResult?.data?.user ?? null;

  if (!sessionUser?.id) return null;

  const tenantSlug =
    c.req.header("X-Tenant-Slug") ?? c.req.query("tenant");

  if (!tenantSlug) return null;

  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, tenantSlug))
    .limit(1);

  if (!org) return null;

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, sessionUser.id), eq(member.organizationId, org.id)),
    )
    .limit(1);

  if (!membership) return null;

  const role: ParticipantRole =
    membership.role === "super_admin" ? "admin" : (membership.role as ParticipantRole);

  return {
    userId: sessionUser.id,
    userName: sessionUser.name ?? null,
    organizationId: org.id,
    role,
    authType: "session",
  };
}
