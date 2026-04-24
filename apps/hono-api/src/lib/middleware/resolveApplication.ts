import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { applications } from "../../db/schema/applications.js";
import { enforceOrigin } from "../security/originMatcher.js";
import { HTTP_STATUS } from "../http.js";

export type ResolvedApplication = {
  id: string;
  domain: string;
  allowedOrigins: string[];
  organizationId: string;
};

type EnforceOriginOptions = {
  keyEnvironment?: "live" | "test";
  requireOrigin?: boolean;
};

type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export type AuthorizeResult =
  | { authorized: true; application: ResolvedApplication }
  | { authorized: false; status: HttpStatusCode; error: string; message: string };

export async function resolveAndEnforceOrigin(
  appId: string,
  origin: string | null | undefined,
  options?: EnforceOriginOptions,
): Promise<AuthorizeResult> {
  const application = await resolveApplicationById(appId);
  if (!application) {
    return { authorized: false, status: HTTP_STATUS.NOT_FOUND, error: "app_not_found", message: "Application not found" };
  }

  const originCheck = enforceOrigin({
    origin,
    allowedOrigins: application.allowedOrigins,
    keyEnvironment: options?.keyEnvironment,
    requireOrigin: options?.requireOrigin,
  });

  if (!originCheck.allowed) {
    return { authorized: false, status: HTTP_STATUS.FORBIDDEN, error: originCheck.error, message: originCheck.message };
  }

  return { authorized: true, application };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export async function resolveApplicationById(
  appId: string,
): Promise<ResolvedApplication | null> {
  if (!isValidUuid(appId)) return null;

  const [application] = await db
    .select({
      id: applications.id,
      domain: applications.domain,
      allowedOrigins: applications.allowedOrigins,
      organizationId: applications.organizationId,
    })
    .from(applications)
    .where(and(eq(applications.id, appId), isNull(applications.deletedAt)))
    .limit(1);

  return application ?? null;
}
