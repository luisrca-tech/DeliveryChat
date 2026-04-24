import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { apiKeys } from "../../db/schema/apiKeys.js";
import { applications } from "../../db/schema/applications.js";

export class ApplicationNotFoundError extends Error {
  constructor(message = "Application not found") {
    super(message);
    this.name = "ApplicationNotFoundError";
  }
}

export class ApplicationDomainConflictError extends Error {
  constructor(message = "Domain already exists") {
    super(message);
    this.name = "ApplicationDomainConflictError";
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export type UpdateApplicationInput = {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  allowedOrigins?: string[];
};

export async function getApplicationSettings(
  id: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ settings: applications.settings })
    .from(applications)
    .where(
      and(eq(applications.id, id), isNull(applications.deletedAt)),
    )
    .limit(1);
  return row ? (row.settings as Record<string, unknown>) : null;
}

export async function getApplication(
  id: string,
  organizationId: string,
): Promise<typeof applications.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, id),
        eq(applications.organizationId, organizationId),
        isNull(applications.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateApplication(
  id: string,
  organizationId: string,
  data: UpdateApplicationInput,
): Promise<typeof applications.$inferSelect | null> {
  const existing = await getApplication(id, organizationId);
  if (!existing) return null;

  const updates: Partial<typeof applications.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.settings !== undefined) updates.settings = data.settings;
  if (data.allowedOrigins !== undefined)
    updates.allowedOrigins = data.allowedOrigins;

  const [updated] = await db
    .update(applications)
    .set(updates)
    .where(
      and(
        eq(applications.id, id),
        eq(applications.organizationId, organizationId),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function countActiveApiKeys(
  applicationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.applicationId, applicationId), isNull(apiKeys.revokedAt)),
    );
  return row?.count ?? 0;
}

export async function deleteApplication(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const existing = await getApplication(id, organizationId);
  if (!existing) return false;

  return db.transaction(async (tx) => {
    await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.applicationId, id), isNull(apiKeys.revokedAt)));

    const [updated] = await tx
      .update(applications)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(applications.id, id),
          eq(applications.organizationId, organizationId),
          isNull(applications.deletedAt),
        ),
      )
      .returning({ id: applications.id });

    return !!updated;
  });
}
