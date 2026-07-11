import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db/index.js";
import { applications } from "../../../db/schema/applications.js";
import {
  applicationDataSource,
  type DataSourceConfig,
} from "../../../db/schema/applicationDataSource.js";
import {
  applicationDataTool,
  type DataToolConfig,
} from "../../../db/schema/applicationDataTool.js";
import type { DataSourceSelect, DataToolSelect } from "./helpers.js";

/** Resolve an application owned by the tenant (tenant-isolation guard). */
export async function findOwnedApplication(
  applicationId: string,
  organizationId: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.organizationId, organizationId),
        isNull(applications.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getDataSource(
  applicationId: string,
): Promise<DataSourceSelect | null> {
  const rows = await db
    .select()
    .from(applicationDataSource)
    .where(eq(applicationDataSource.applicationId, applicationId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upsert the single DataSource for an application. On save, `enabled` is set to
 * true (a saved source is usable). Uniqueness on `applicationId` makes this an
 * insert-or-update.
 */
export async function upsertDataSource(input: {
  applicationId: string;
  kind: "http" | "sql";
  config: DataSourceConfig;
}): Promise<DataSourceSelect> {
  const rows = await db
    .insert(applicationDataSource)
    .values({
      applicationId: input.applicationId,
      kind: input.kind,
      config: input.config,
      enabled: true,
    })
    .onConflictDoUpdate({
      target: applicationDataSource.applicationId,
      set: {
        kind: input.kind,
        config: input.config,
        enabled: true,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("upsertDataSource returned no row");
  return row;
}

export async function listDataTools(
  applicationId: string,
): Promise<DataToolSelect[]> {
  return db
    .select()
    .from(applicationDataTool)
    .where(eq(applicationDataTool.applicationId, applicationId));
}

export async function getDataTool(
  toolId: string,
  applicationId: string,
): Promise<DataToolSelect | null> {
  const rows = await db
    .select()
    .from(applicationDataTool)
    .where(
      and(
        eq(applicationDataTool.id, toolId),
        eq(applicationDataTool.applicationId, applicationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createDataTool(input: {
  applicationId: string;
  name: string;
  description: string;
  inputSchema: unknown;
  backingType: "http" | "sql";
  config: DataToolConfig;
}): Promise<DataToolSelect> {
  const rows = await db
    .insert(applicationDataTool)
    .values({
      applicationId: input.applicationId,
      name: input.name,
      description: input.description,
      inputSchema: input.inputSchema,
      backingType: input.backingType,
      config: input.config,
      enabled: false,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("createDataTool returned no row");
  return row;
}

/**
 * Update a tool's definition. Any config/schema change resets the tool to an
 * untested, disabled state — it must pass a fresh test before it can be enabled.
 */
export async function updateDataTool(input: {
  toolId: string;
  applicationId: string;
  name: string;
  description: string;
  inputSchema: unknown;
  backingType: "http" | "sql";
  config: DataToolConfig;
}): Promise<DataToolSelect | null> {
  const rows = await db
    .update(applicationDataTool)
    .set({
      name: input.name,
      description: input.description,
      inputSchema: input.inputSchema,
      backingType: input.backingType,
      config: input.config,
      enabled: false,
      lastTestedAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(applicationDataTool.id, input.toolId),
        eq(applicationDataTool.applicationId, input.applicationId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function deleteDataTool(
  toolId: string,
  applicationId: string,
): Promise<boolean> {
  const rows = await db
    .delete(applicationDataTool)
    .where(
      and(
        eq(applicationDataTool.id, toolId),
        eq(applicationDataTool.applicationId, applicationId),
      ),
    )
    .returning({ id: applicationDataTool.id });
  return rows.length > 0;
}

export async function markToolTested(
  toolId: string,
  applicationId: string,
): Promise<DataToolSelect | null> {
  const rows = await db
    .update(applicationDataTool)
    .set({ lastTestedAt: new Date().toISOString() })
    .where(
      and(
        eq(applicationDataTool.id, toolId),
        eq(applicationDataTool.applicationId, applicationId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function setToolEnabled(
  toolId: string,
  applicationId: string,
  enabled: boolean,
): Promise<DataToolSelect | null> {
  const rows = await db
    .update(applicationDataTool)
    .set({ enabled, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(applicationDataTool.id, toolId),
        eq(applicationDataTool.applicationId, applicationId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}
