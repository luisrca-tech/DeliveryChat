import type { Context } from "hono";
import { auth } from "../auth.js";
import {
  verifyApiKey,
} from "../../features/api-keys/api-key.service.js";
import { db } from "../../db/index.js";
import { member } from "../../db/schema/member.js";
import { applications } from "../../db/schema/applications.js";
import { and, eq } from "drizzle-orm";
import { organization } from "../../db/schema/organization.js";
import type { ParticipantRole } from "@repo/types";

const KEY_REGEX = /^dk_(live|test)_[a-zA-Z0-9]{32}$/;

export interface AuthenticatedWSUser {
  userId: string;
  organizationId: string;
  role: ParticipantRole;
  authType: "session" | "apiKey";
  applicationId?: string;
}

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
type SessionWithUser = SessionResult & {
  user?: { id: string };
  data?: { user?: { id: string } };
};

/**
 * Authenticates a WebSocket connection during the HTTP upgrade phase.
 *
 * Two auth paths:
 * 1. Session cookie (admin app) — reads session from request headers
 * 2. Query params (widget) — token + appId in the WS URL
 *
 * Returns null if authentication fails.
 */
export async function authenticateWebSocket(
  c: Context,
): Promise<AuthenticatedWSUser | null> {
  // Path 1: Try API key auth via query params (widget)
  const token = c.req.query("token");
  const appId = c.req.query("appId");

  if (token && appId) {
    return authenticateWithApiKey(token, appId);
  }

  // Path 2: Try session auth (admin app)
  return authenticateWithSession(c);
}

async function authenticateWithApiKey(
  token: string,
  appId: string,
): Promise<AuthenticatedWSUser | null> {
  if (!KEY_REGEX.test(token)) return null;

  const result = await verifyApiKey(token);
  if (!result.valid) return null;
  if (result.application.id !== appId) return null;

  // verifyApiKey doesn't return organizationId, look it up from the application
  const [app] = await db
    .select({ organizationId: applications.organizationId })
    .from(applications)
    .where(eq(applications.id, appId))
    .limit(1);

  if (!app) return null;

  return {
    userId: `anonymous-${crypto.randomUUID()}`,
    organizationId: app.organizationId,
    role: "visitor",
    authType: "apiKey",
    applicationId: appId,
  };
}

async function authenticateWithSession(
  c: Context,
): Promise<AuthenticatedWSUser | null> {
  const sessionResult = (await auth.api.getSession({
    headers: c.req.raw.headers,
  })) as SessionWithUser | null;

  const sessionUser =
    sessionResult?.user ?? sessionResult?.data?.user ?? null;

  if (!sessionUser?.id) return null;

  // Resolve tenant from headers (same priority as requireTenantAuth)
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
    organizationId: org.id,
    role,
    authType: "session",
  };
}
