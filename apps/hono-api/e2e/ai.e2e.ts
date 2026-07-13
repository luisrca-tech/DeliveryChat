/**
 * E2E tests for AI Assistant endpoints.
 *
 * PREREQUISITE: The hono-api server must be running with AI_MODEL=mock://test
 * so the MockProvider is used instead of calling the real Groq API.
 *
 * Run with: AI_MODEL=mock://test infisical run --path=/hono-api -- npx playwright test e2e/ai.e2e.ts
 */
import { test, expect } from "@playwright/test";
import {
  provisionTestData,
  cleanupTestData,
  createConversationInDB,
  createSessionInDB,
  addMessageInDB,
  type E2ETestData,
} from "./helpers/db-fixture";

// ── Shared state ──

let premiumData: E2ETestData;
let premiumOperatorToken: string;
let premiumAdminToken: string;

function authHeaders(token: string, slug: string) {
  return {
    Cookie: `better-auth.session_token=${token}`,
    "X-Tenant-Slug": slug,
    "Content-Type": "application/json",
  };
}

// ── Setup / Teardown ──

test.beforeAll(async () => {
  premiumData = await provisionTestData({
    plan: "PREMIUM",
    planStatus: "active",
  });
  premiumOperatorToken = await createSessionInDB(premiumData.operatorUser.id);
  premiumAdminToken = await createSessionInDB(premiumData.adminUser.id);

  console.log(`[AI E2E] Provisioned: org=${premiumData.org.slug} plan=PREMIUM`);
});

test.afterAll(async () => {
  await cleanupTestData(premiumData);
  console.log("[AI E2E] Cleaned up premium test data");
});

// ── Generate Reply ──

test.describe("POST /ai/generate-reply", () => {
  test("happy path: generates a reply for a conversation with messages", async ({
    request,
  }) => {
    const conversationId = await createConversationInDB({
      organizationId: premiumData.org.id,
      applicationId: premiumData.app.id,
      participants: [
        { userId: premiumData.visitorUser.id, role: "visitor" },
        { userId: premiumData.operatorUser.id, role: "operator" },
      ],
    });

    await addMessageInDB({
      conversationId,
      senderId: premiumData.visitorUser.id,
      content: "Hi, I need help with my order!",
    });

    const response = await request.post("/api/v1/ai/generate-reply", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: { conversationId },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.text).toBeDefined();
    expect(typeof body.text).toBe("string");
    expect(body.text.length).toBeGreaterThan(0);
  });

  test("works with empty conversation history (no messages)", async ({
    request,
  }) => {
    const conversationId = await createConversationInDB({
      organizationId: premiumData.org.id,
      applicationId: premiumData.app.id,
      participants: [
        { userId: premiumData.visitorUser.id, role: "visitor" },
        { userId: premiumData.operatorUser.id, role: "operator" },
      ],
    });

    const response = await request.post("/api/v1/ai/generate-reply", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: { conversationId },
    });

    // MockProvider always returns a response regardless of empty context
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.text).toBeDefined();
  });

  test("rejects invalid conversationId format", async ({ request }) => {
    const response = await request.post("/api/v1/ai/generate-reply", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: { conversationId: "not-a-uuid" },
    });

    expect(response.status()).toBe(400);
  });
});

// ── Improve Message ──

test.describe("POST /ai/improve-message", () => {
  test("happy path: improves a draft message", async ({ request }) => {
    const conversationId = await createConversationInDB({
      organizationId: premiumData.org.id,
      applicationId: premiumData.app.id,
      participants: [
        { userId: premiumData.visitorUser.id, role: "visitor" },
        { userId: premiumData.operatorUser.id, role: "operator" },
      ],
    });

    await addMessageInDB({
      conversationId,
      senderId: premiumData.visitorUser.id,
      content: "My package arrived damaged",
    });

    const response = await request.post("/api/v1/ai/improve-message", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: {
        conversationId,
        draft: "sorry about that we will fix it",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.text).toBeDefined();
    expect(typeof body.text).toBe("string");
    expect(body.text.length).toBeGreaterThan(0);
  });

  test("accepts draft at exactly 4000 characters", async ({ request }) => {
    const conversationId = await createConversationInDB({
      organizationId: premiumData.org.id,
      applicationId: premiumData.app.id,
      participants: [{ userId: premiumData.operatorUser.id, role: "operator" }],
    });

    const draft = "a".repeat(4000);
    const response = await request.post("/api/v1/ai/improve-message", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: { conversationId, draft },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.text).toBeDefined();
  });

  test("rejects draft exceeding 4000 characters", async ({ request }) => {
    const conversationId = await createConversationInDB({
      organizationId: premiumData.org.id,
      applicationId: premiumData.app.id,
      participants: [{ userId: premiumData.operatorUser.id, role: "operator" }],
    });

    const draft = "a".repeat(4001);
    const response = await request.post("/api/v1/ai/improve-message", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: { conversationId, draft },
    });

    expect(response.status()).toBe(400);
  });

  test("rejects empty draft", async ({ request }) => {
    const conversationId = await createConversationInDB({
      organizationId: premiumData.org.id,
      applicationId: premiumData.app.id,
      participants: [{ userId: premiumData.operatorUser.id, role: "operator" }],
    });

    const response = await request.post("/api/v1/ai/improve-message", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: { conversationId, draft: "" },
    });

    expect(response.status()).toBe(400);
  });
});

// ── Plan Gating ──

test.describe("AI plan gating", () => {
  let freeData: E2ETestData;
  let freeOperatorToken: string;

  test.beforeAll(async () => {
    freeData = await provisionTestData({ plan: "FREE", planStatus: "active" });
    freeOperatorToken = await createSessionInDB(freeData.operatorUser.id);
    console.log(`[AI E2E] Provisioned FREE org: ${freeData.org.slug}`);
  });

  test.afterAll(async () => {
    await cleanupTestData(freeData);
    console.log("[AI E2E] Cleaned up FREE test data");
  });

  test("FREE plan tenant is blocked from generate-reply", async ({
    request,
  }) => {
    const conversationId = await createConversationInDB({
      organizationId: freeData.org.id,
      applicationId: freeData.app.id,
      participants: [{ userId: freeData.operatorUser.id, role: "operator" }],
    });

    const response = await request.post("/api/v1/ai/generate-reply", {
      headers: authHeaders(freeOperatorToken, freeData.org.slug),
      data: { conversationId },
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("ai_feature_not_available");
  });

  test("FREE plan tenant is blocked from improve-message", async ({
    request,
  }) => {
    const conversationId = await createConversationInDB({
      organizationId: freeData.org.id,
      applicationId: freeData.app.id,
      participants: [{ userId: freeData.operatorUser.id, role: "operator" }],
    });

    const response = await request.post("/api/v1/ai/improve-message", {
      headers: authHeaders(freeOperatorToken, freeData.org.slug),
      data: { conversationId, draft: "fix this message" },
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("ai_feature_not_available");
  });
});

// ── Billing Gating ──

test.describe("AI billing gating", () => {
  let canceledData: E2ETestData;
  let canceledOperatorToken: string;

  test.beforeAll(async () => {
    canceledData = await provisionTestData({
      plan: "PREMIUM",
      planStatus: "canceled",
    });
    canceledOperatorToken = await createSessionInDB(
      canceledData.operatorUser.id,
    );
    console.log(`[AI E2E] Provisioned canceled org: ${canceledData.org.slug}`);
  });

  test.afterAll(async () => {
    await cleanupTestData(canceledData);
    console.log("[AI E2E] Cleaned up canceled test data");
  });

  test("billing-suspended tenant is blocked from AI features", async ({
    request,
  }) => {
    const conversationId = await createConversationInDB({
      organizationId: canceledData.org.id,
      applicationId: canceledData.app.id,
      participants: [
        { userId: canceledData.operatorUser.id, role: "operator" },
      ],
    });

    const response = await request.post("/api/v1/ai/generate-reply", {
      headers: authHeaders(canceledOperatorToken, canceledData.org.slug),
      data: { conversationId },
    });

    expect(response.status()).toBe(403);
  });
});

// ── Usage Endpoint & Role Gating ──

test.describe("GET /ai/usage", () => {
  test("admin can access AI usage logs", async ({ request }) => {
    // First generate some usage by calling generate-reply
    const conversationId = await createConversationInDB({
      organizationId: premiumData.org.id,
      applicationId: premiumData.app.id,
      participants: [
        { userId: premiumData.visitorUser.id, role: "visitor" },
        { userId: premiumData.operatorUser.id, role: "operator" },
      ],
    });

    await addMessageInDB({
      conversationId,
      senderId: premiumData.visitorUser.id,
      content: "Usage test message",
    });

    await request.post("/api/v1/ai/generate-reply", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
      data: { conversationId },
    });

    // Now query usage as admin
    const response = await request.get("/api/v1/ai/usage", {
      headers: authHeaders(premiumAdminToken, premiumData.org.slug),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.logs).toBeDefined();
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.total).toBeDefined();
    expect(typeof body.total).toBe("number");
    expect(body.total).toBeGreaterThan(0);

    const log = body.logs[0];
    expect(log.action).toBeDefined();
    expect(log.status).toBeDefined();
    expect(log.model).toBeDefined();
    expect(log.createdAt).toBeDefined();
  });

  test("operator cannot access AI usage logs", async ({ request }) => {
    const response = await request.get("/api/v1/ai/usage", {
      headers: authHeaders(premiumOperatorToken, premiumData.org.slug),
    });

    expect(response.status()).toBe(403);
  });

  test("supports action filter", async ({ request }) => {
    const response = await request.get("/api/v1/ai/usage?action=generate", {
      headers: authHeaders(premiumAdminToken, premiumData.org.slug),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    for (const log of body.logs) {
      expect(log.action).toBe("generate");
    }
  });

  test("supports status filter", async ({ request }) => {
    const response = await request.get("/api/v1/ai/usage?status=success", {
      headers: authHeaders(premiumAdminToken, premiumData.org.slug),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    for (const log of body.logs) {
      expect(log.status).toBe("success");
    }
  });

  test("supports pagination", async ({ request }) => {
    const response = await request.get("/api/v1/ai/usage?limit=1&offset=0", {
      headers: authHeaders(premiumAdminToken, premiumData.org.slug),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.logs.length).toBeLessThanOrEqual(1);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(0);
  });
});
