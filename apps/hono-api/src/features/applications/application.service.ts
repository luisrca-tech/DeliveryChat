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

export class ApplicationPortConflictError extends Error {
  readonly conflictingAppName: string;
  readonly port: number;
  constructor(port: number, conflictingAppName: string) {
    super(
      `Port ${port} is already used by application "${conflictingAppName}"`,
    );
    this.name = "ApplicationPortConflictError";
    this.port = port;
    this.conflictingAppName = conflictingAppName;
  }
}

export type CreateApplicationInput =
  | {
      kind: "production";
      name: string;
      domain: string;
      description?: string;
      settings?: Record<string, unknown>;
    }
  | {
      kind: "test";
      name: string;
      domain: "localhost";
      port: number;
      description?: string;
      settings?: Record<string, unknown>;
    };

export async function createApplication(
  organizationId: string,
  input: CreateApplicationInput,
): Promise<typeof applications.$inferSelect> {
  const id = crypto.randomUUID();
  const allowedOrigins =
    input.kind === "test"
      ? [`localhost:${input.port}`]
      : [input.domain];

  try {
    const [row] = await db
      .insert(applications)
      .values({
        id,
        organizationId,
        name: input.name,
        domain: input.domain,
        kind: input.kind,
        port: input.kind === "test" ? input.port : null,
        description: input.description,
        settings: input.settings ?? {},
        allowedOrigins,
      })
      .returning();
    if (!row) throw new Error("Failed to create application");
    return row;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    if (input.kind === "test") {
      const [conflict] = await db
        .select({ name: applications.name })
        .from(applications)
        .where(
          and(
            eq(applications.organizationId, organizationId),
            eq(applications.kind, "test"),
            eq(applications.port, input.port),
            isNull(applications.deletedAt),
          ),
        )
        .limit(1);
      throw new ApplicationPortConflictError(
        input.port,
        conflict?.name ?? "another application",
      );
    }
    throw new ApplicationDomainConflictError();
  }
}

export function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  if ((err as { code?: unknown }).code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause != null && typeof cause === "object") {
    return (cause as { code?: unknown }).code === "23505";
  }
  return false;
}

export type UpdateApplicationInput = {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  allowedOrigins?: string[];
  aiAutoRespond?: boolean;
  aiDbEnabled?: boolean;
};

export async function getApplicationSettings(
  id: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ settings: applications.settings })
    .from(applications)
    .where(and(eq(applications.id, id), isNull(applications.deletedAt)))
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
  if (data.aiAutoRespond !== undefined)
    updates.aiAutoRespond = data.aiAutoRespond;
  if (data.aiDbEnabled !== undefined) updates.aiDbEnabled = data.aiDbEnabled;

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
