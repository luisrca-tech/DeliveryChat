/**
 * E2E test fixture that provisions test data directly in the database.
 *
 * IMPORTANT: This file imports from the app's source code, so it requires
 * the same env vars (DATABASE_URL, etc.) that the app uses.
 * Run with: infisical run --path=/hono-api -- npx playwright test
 */
import { randomUUID } from "node:crypto";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db/index";
import { organization } from "../../src/db/schema/organization";
import { user } from "../../src/db/schema/users";
import { member } from "../../src/db/schema/member";
import { session } from "../../src/db/schema/session";
import { applications } from "../../src/db/schema/applications";
import { apiKeys } from "../../src/db/schema/apiKeys";
import { conversations } from "../../src/db/schema/conversations";
import { messages } from "../../src/db/schema/messages";
import { conversationParticipants } from "../../src/db/schema/conversationParticipants";
import { aiUsageLog } from "../../src/db/schema/aiUsageLog";
import { createHash } from "node:crypto";

const E2E_PREFIX = "e2e_test_";

export interface E2ETestData {
  org: { id: string; slug: string };
  app: { id: string; domain: string };
  apiKeyRaw: string;
  operatorUser: { id: string; name: string; email: string };
  adminUser: { id: string; name: string; email: string };
  visitorUser: { id: string; name: string; email: string };
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function provisionTestData(
  opts?: {
    plan?: "FREE" | "BASIC" | "PREMIUM" | "ENTERPRISE";
    planStatus?: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "paused" | null;
    orgStatus?: "ACTIVE" | "PENDING_VERIFICATION" | "EXPIRED" | "DELETED";
  },
): Promise<E2ETestData> {
  const testId = randomUUID().slice(0, 8);
  const orgSlug = `${E2E_PREFIX}${testId}`;

  // 1. Create organization
  const [org] = await db
    .insert(organization)
    .values({
      id: randomUUID(),
      slug: orgSlug,
      name: `E2E Test Org ${testId}`,
      plan: opts?.plan ?? "FREE",
      planStatus: opts?.planStatus ?? null,
      status: opts?.orgStatus ?? "ACTIVE",
    })
    .returning();

  // 2. Create application
  const appId = randomUUID();
  const [app] = await db
    .insert(applications)
    .values({
      id: appId,
      organizationId: org.id,
      name: `E2E Test App ${testId}`,
      domain: `${E2E_PREFIX}${testId}.test.local`,
      settings: {},
    })
    .returning();

  // 3. Create users
  const operatorId = randomUUID();
  const adminId = randomUUID();
  const visitorId = randomUUID();

  const [operatorUser] = await db
    .insert(user)
    .values({
      id: operatorId,
      name: `E2E Operator ${testId}`,
      email: `${E2E_PREFIX}operator_${testId}@test.local`,
      status: "ACTIVE",
      isAnonymous: false,
    })
    .returning();

  const [adminUser] = await db
    .insert(user)
    .values({
      id: adminId,
      name: `E2E Admin ${testId}`,
      email: `${E2E_PREFIX}admin_${testId}@test.local`,
      status: "ACTIVE",
      isAnonymous: false,
    })
    .returning();

  const [visitorUser] = await db
    .insert(user)
    .values({
      id: visitorId,
      name: `E2E Visitor ${testId}`,
      email: `${E2E_PREFIX}visitor_${testId}@test.local`,
      status: "ACTIVE",
      isAnonymous: true,
    })
    .returning();

  // 4. Create memberships
  await db.insert(member).values([
    {
      id: randomUUID(),
      organizationId: org.id,
      userId: operatorId,
      role: "operator",
    },
    {
      id: randomUUID(),
      organizationId: org.id,
      userId: adminId,
      role: "admin",
    },
  ]);

  // 5. Create API key for widget auth
  const rawKey = `dk_test_${randomUUID().replace(/-/g, "")}`;
  const keyHash = hashApiKey(rawKey);

  await db.insert(apiKeys).values({
    id: randomUUID(),
    applicationId: appId,
    keyHash,
    keyPrefix: rawKey.slice(0, 12),
    environment: "test",
    name: `E2E Test Key ${testId}`,
  });

  return {
    org: { id: org.id, slug: org.slug! },
    app: { id: app.id, domain: app.domain },
    apiKeyRaw: rawKey,
    operatorUser: {
      id: operatorUser.id,
      name: operatorUser.name,
      email: operatorUser.email,
    },
    adminUser: {
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
    },
    visitorUser: {
      id: visitorUser.id,
      name: visitorUser.name,
      email: visitorUser.email,
    },
  };
}

/**
 * Creates a conversation directly in the DB with specified participants.
 * Returns the conversation ID.
 */
export async function createConversationInDB(opts: {
  organizationId: string;
  applicationId?: string;
  subject?: string;
  participants: { userId: string; role: "visitor" | "operator" | "admin" }[];
}): Promise<string> {
  const convId = randomUUID();
  await db.insert(conversations).values({
    id: convId,
    organizationId: opts.organizationId,
    applicationId: opts.applicationId ?? null,
    subject: opts.subject ?? null,
  });

  for (const p of opts.participants) {
    await db.insert(conversationParticipants).values({
      id: randomUUID(),
      conversationId: convId,
      userId: p.userId,
      role: p.role,
    });
  }

  return convId;
}

/**
 * Adds a participant to an existing conversation.
 */
export async function addParticipantInDB(
  conversationId: string,
  userId: string,
  role: "visitor" | "operator" | "admin",
) {
  await db.insert(conversationParticipants).values({
    id: randomUUID(),
    conversationId,
    userId,
    role,
  });
}

/**
 * Creates a Better Auth session directly in the DB for E2E testing.
 * Returns the session token to use in Authorization or Cookie headers.
 */
export async function createSessionInDB(userId: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db.insert(session).values({
    id: randomUUID(),
    userId,
    token,
    expiresAt,
    ipAddress: "127.0.0.1",
    userAgent: "E2E-Test",
  });

  return token;
}

/**
 * Adds a message to a conversation directly in the DB.
 */
export async function addMessageInDB(opts: {
  conversationId: string;
  senderId: string;
  content: string;
}): Promise<string> {
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: opts.conversationId,
      senderId: opts.senderId,
      content: opts.content,
    })
    .returning();
  return msg.id;
}

export async function cleanupTestData(data: E2ETestData) {
  const userIds = [
    data.operatorUser.id,
    data.adminUser.id,
    data.visitorUser.id,
  ];

  // Delete in reverse dependency order
  await db
    .delete(aiUsageLog)
    .where(eq(aiUsageLog.tenantId, data.org.id));

  await db
    .delete(conversationParticipants)
    .where(inArray(conversationParticipants.userId, userIds));

  await db
    .delete(messages)
    .where(inArray(messages.senderId, userIds));

  await db
    .delete(conversations)
    .where(eq(conversations.organizationId, data.org.id));

  await db.delete(apiKeys).where(eq(apiKeys.applicationId, data.app.id));

  await db.delete(member).where(eq(member.organizationId, data.org.id));

  await db
    .delete(session)
    .where(inArray(session.userId, userIds));

  await db
    .delete(applications)
    .where(eq(applications.organizationId, data.org.id));

  await db.delete(user).where(inArray(user.id, userIds));

  await db.delete(organization).where(eq(organization.id, data.org.id));
}
