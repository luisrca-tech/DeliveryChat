import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { applications } from "../../db/schema/applications.js";

export type ResolvedApplication = {
  id: string;
  domain: string;
  allowedOrigins: string[];
  organizationId: string;
};

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
