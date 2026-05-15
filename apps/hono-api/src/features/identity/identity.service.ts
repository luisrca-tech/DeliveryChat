import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { visitorIdentities } from "../../db/schema/visitorIdentities.js";

export type UpsertVisitorIdentityInput = {
  anonymousUserId: string;
  organizationId: string;
  externalId?: string;
  email?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  hmacVerified?: boolean;
};

export async function upsertVisitorIdentity(
  input: UpsertVisitorIdentityInput,
) {
  const [result] = await db
    .insert(visitorIdentities)
    .values({
      anonymousUserId: input.anonymousUserId,
      organizationId: input.organizationId,
      externalId: input.externalId,
      email: input.email,
      name: input.name,
      metadata: input.metadata,
      hmacVerified: input.hmacVerified ?? false,
    })
    .onConflictDoUpdate({
      target: [
        visitorIdentities.anonymousUserId,
        visitorIdentities.organizationId,
      ],
      set: {
        externalId: input.externalId ?? sql`${visitorIdentities.externalId}`,
        email: input.email ?? sql`${visitorIdentities.email}`,
        name: input.name ?? sql`${visitorIdentities.name}`,
        metadata: input.metadata ?? sql`${visitorIdentities.metadata}`,
        hmacVerified: input.hmacVerified ?? sql`${visitorIdentities.hmacVerified}`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return result;
}
