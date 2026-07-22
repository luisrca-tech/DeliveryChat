import type { Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db/index.js";
import { applications } from "../../../db/schema/applications.js";
import { user } from "../../../db/schema/users.js";
import { env } from "../../../env.js";
import { mapAiErrorToResponse } from "../../../features/ai/ai.errorMapper.js";
import {
  MissingTopicsError,
  SummaryGenerationFailedError,
  TurnConflictError,
} from "../../../features/ai/ai.errors.js";
import { createAIProvider } from "../../../features/ai/ai.openRouterProvider.js";
import type { AIProviderPort } from "../../../features/ai/ai.providerPort.js";
import { ERROR_MESSAGES, HTTP_STATUS, jsonError } from "../../../lib/http.js";

let providerInstance: AIProviderPort | null = null;
export function getInterviewProvider(): AIProviderPort {
  if (!providerInstance) {
    providerInstance = createAIProvider(
      env.AI_INTERVIEW_MODEL,
      env.OPENROUTER_API_KEY,
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

export async function getUserName(userId: string): Promise<string | null> {
  const rows = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.name ?? null;
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
  if (error instanceof SummaryGenerationFailedError) {
    console.error(`${label} failed:`, error);
    return c.json(
      { error: error.code, message: error.message },
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
