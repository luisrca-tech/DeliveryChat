import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { apiKeys } from "../../db/schema/apiKeys.js";
import { applications } from "../../db/schema/applications.js";
import { keyEnvironmentEnum } from "../../db/schema/enums/keyEnvironmentEnum.js";

type KeyEnvironment = (typeof keyEnvironmentEnum.enumValues)[number];

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_RANDOM_LENGTH = 32;
const KEY_PREFIX_LENGTH = 16;
const MAX_KEYS_PER_APP = 10;
const MAX_COLLISION_RETRIES = 3;

export class ApiKeyLimitError extends Error {
  constructor(message = "Maximum API keys per application exceeded") {
    super(message);
    this.name = "ApiKeyLimitError";
  }
}

export class KeyGenerationError extends Error {
  constructor(message = "Failed to generate unique API key after retries") {
    super(message);
    this.name = "KeyGenerationError";
  }
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateRawKey(environment: KeyEnvironment = "live"): string {
  const prefix = `dk_${environment}_`;
  let random = "";
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_RANDOM_LENGTH));
  for (let i = 0; i < KEY_RANDOM_LENGTH; i++) {
    random += BASE62[bytes[i]! % 62];
  }
  return prefix + random;
}

export function validateOrigin(
  origin: string | null | undefined,
  allowedDomain: string,
): boolean {
  if (!origin) return true;
  let host: string;
  try {
    const url = new URL(origin);
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  const domain = allowedDomain.toLowerCase();
  if (domain.startsWith("*.")) {
    const base = domain.slice(2);
    return host === base || host.endsWith("." + base);
  }
  return host === domain || host.endsWith("." + domain);
}

export type CreateApiKeyInput = {
  applicationId: string;
  name?: string;
  environment?: KeyEnvironment;
  expiresAt?: string;
};

export type CreateApiKeyResult = {
  id: string;
  applicationId: string;
  key: string;
  keyPrefix: string;
  name: string | null;
  environment: KeyEnvironment;
  expiresAt: Date | null;
  createdAt: Date;
};

export async function createApiKey(
  input: CreateApiKeyInput,
  maxKeys = MAX_KEYS_PER_APP,
): Promise<CreateApiKeyResult> {
  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.applicationId, input.applicationId),
        isNull(apiKeys.revokedAt),
      ),
    );
  if ((count[0]?.count ?? 0) >= maxKeys) {
    throw new ApiKeyLimitError();
  }

  const environment = input.environment ?? "live";
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    try {
      const rawKey = generateRawKey(environment);
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
      const id = `key_${crypto.randomUUID().replace(/-/g, "")}`;

      await db.insert(apiKeys).values({
        id,
        applicationId: input.applicationId,
        keyHash,
        keyPrefix,
        name: input.name ?? null,
        environment,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });

      const [row] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, id))
        .limit(1);

      return {
        id: row!.id,
        applicationId: row!.applicationId,
        key: rawKey,
        keyPrefix: row!.keyPrefix,
        name: row!.name,
        environment: row!.environment,
        expiresAt: row!.expiresAt ?? null,
        createdAt: row!.createdAt!,
      };
    } catch (err) {
      lastError = err;
      const isUniqueViolation =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "23505";
      if (!isUniqueViolation) throw err;
    }
  }
  throw new KeyGenerationError(
    lastError instanceof Error ? lastError.message : undefined,
  );
}

export async function listApiKeys(applicationId: string) {
  return db
    .select({
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      name: apiKeys.name,
      environment: apiKeys.environment,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.applicationId, applicationId))
    .orderBy(sql`${apiKeys.createdAt} desc`);
}

export async function revokeApiKey(keyId: string): Promise<boolean> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))
    .returning({ id: apiKeys.id });
  return !!row;
}

export async function regenerateApiKey(
  keyId: string,
  options?: { name?: string; expiresAt?: string },
): Promise<CreateApiKeyResult | null> {
  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  if (!existing) return null;

  return db.transaction(async (tx) => {
    await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, keyId));

    const rawKey = generateRawKey(existing.environment);
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
    const newId = `key_${crypto.randomUUID().replace(/-/g, "")}`;

    await tx.insert(apiKeys).values({
      id: newId,
      applicationId: existing.applicationId,
      keyHash,
      keyPrefix,
      name: options?.name ?? existing.name,
      environment: existing.environment,
      expiresAt: options?.expiresAt ? new Date(options.expiresAt) : existing.expiresAt,
    });

    const [row] = await tx
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, newId))
      .limit(1);

    return {
      id: row!.id,
      applicationId: row!.applicationId,
      key: rawKey,
      keyPrefix: row!.keyPrefix,
      name: row!.name,
      environment: row!.environment,
      expiresAt: row!.expiresAt ?? null,
      createdAt: row!.createdAt!,
    };
  });
}

export type VerifyApiKeyResult =
  | {
      valid: true;
      application: { id: string; domain: string };
      apiKey: { id: string };
    }
  | { valid: false; reason: "not_found" | "revoked" | "expired" };

export async function verifyApiKey(
  rawKey: string,
): Promise<VerifyApiKeyResult> {
  const keyHash = hashApiKey(rawKey);
  const [row] = await db
    .select({
      id: apiKeys.id,
      applicationId: apiKeys.applicationId,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
      appDomain: applications.domain,
    })
    .from(apiKeys)
    .innerJoin(applications, eq(apiKeys.applicationId, applications.id))
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!row) return { valid: false, reason: "not_found" };
  if (row.revokedAt) return { valid: false, reason: "revoked" };
  if (row.expiresAt && row.expiresAt < new Date())
    return { valid: false, reason: "expired" };

  return {
    valid: true,
    application: { id: row.applicationId, domain: row.appDomain },
    apiKey: { id: row.id },
  };
}

export async function touchLastUsed(keyId: string): Promise<void> {
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyId))
    .then(() => {})
    .catch((err) =>
      console.error("[api-keys] Failed to update last_used_at:", err),
    );
}
