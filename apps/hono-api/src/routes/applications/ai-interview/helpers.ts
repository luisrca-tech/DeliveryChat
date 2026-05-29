import type { Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db/index.js";
import { applications } from "../../../db/schema/applications.js";
import { env } from "../../../env.js";
import { mapAiErrorToResponse } from "../../../features/ai/ai.errorMapper.js";
import {
  MissingTopicsError,
  TurnConflictError,
} from "../../../features/ai/ai.errors.js";
import {
  createAIProvider,
  type AIProvider,
} from "../../../features/ai/ai.provider.js";
import { ERROR_MESSAGES, HTTP_STATUS, jsonError } from "../../../lib/http.js";

let providerInstance: AIProvider | null = null;
export function getInterviewProvider(): AIProvider {
  if (!providerInstance) {
    providerInstance = createAIProvider(
      env.AI_INTERVIEW_MODEL,
      env.GROQ_API_KEY,
    );
  }
  return providerInstance;
}

export async function findOwnedApplication(
  applicationId: string,
  organizationId: string,
) {
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

export function mapInterviewError(c: Context, error: unknown, label: string) {
  if (error instanceof TurnConflictError) {
    return c.json(
      {
        error: "turn_conflict",
        currentTurn: error.currentTurn,
        status: error.status,
      },
      HTTP_STATUS.CONFLICT,
    );
  }
  if (error instanceof MissingTopicsError) {
    return c.json(
      { error: error.code, missing: error.missing },
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
    );
  }
  const mapped = mapAiErrorToResponse(c, error);
  if (mapped) return mapped;
  console.error(`${label} failed:`, error);
  return jsonError(
    c,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    error instanceof Error ? error.message : "Unknown error",
  );
}
