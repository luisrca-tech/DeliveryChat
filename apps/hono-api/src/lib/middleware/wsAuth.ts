import type { Context } from "hono";
import { auth } from "../auth.js";
import { verifyWsToken } from "../security/wsToken.js";
import { resolveApplicationById } from "./resolveApplication.js";
import { db } from "../../db/index.js";
import { member } from "../../db/schema/member.js";
import { and, eq } from "drizzle-orm";
import { organization } from "../../db/schema/organization.js";
import { env } from "../../env.js";
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

export type WsAuthError =
  | "invalid_token"
  | "expired_token"
  | "origin_mismatch"
  | "app_not_found"
  | "unauthorized";

export async function authenticateWebSocket(
  c: Context,
): Promise<{ user: AuthenticatedWSUser } | { error: WsAuthError }> {
  const token = c.req.query("token");

  if (token) {
    return authenticateWithToken(c, token);
  }

  const user = await authenticateWithSession(c);
  if (!user) return { error: "unauthorized" };
  return { user };
}

async function authenticateWithToken(
  c: Context,
  token: string,
): Promise<{ user: AuthenticatedWSUser } | { error: WsAuthError }> {
  const origin = c.req.header("Origin") ?? "";

  const result = verifyWsToken(token, env.WS_TOKEN_SECRET, {
    expectedOrigin: origin,
  });

  if (!result.valid) {
    const errorMap: Record<string, WsAuthError> = {
      malformed_token: "invalid_token",
      invalid_signature: "invalid_token",
      token_expired: "expired_token",
      origin_mismatch: "origin_mismatch",
    };
    return { error: errorMap[result.error] ?? "invalid_token" };
  }

  const app = await resolveApplicationById(result.payload.appId);
  if (!app) return { error: "app_not_found" };

  return {
    user: {
      userId: result.payload.visitorId,
      userName: null,
      organizationId: app.organizationId,
      role: "visitor",
      authType: "widget",
      applicationId: result.payload.appId,
    },
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
