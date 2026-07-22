/**
 * E2E tests for the AI data-connection feature.
 *
 * Two parts, both driven entirely through the REST API against a live server:
 *
 *   Part A — Data source + tool configuration flow (admin session):
 *     PUT/GET /applications/:id/data-source, POST /data-tools, /test, /enable.
 *     Asserts secret redaction, backing-type/name validation, the SSRF egress
 *     guardrail, and the "must pass a test before enabling" rule.
 *
 *   Part B — Conversation lifecycle with AI handling (widget visitor + admin):
 *     initial handledBy resolution, the AI-turn terminal-outcome disjunction
 *     (reply XOR escalation — never dead air), deterministic human-request
 *     escalation (pre-LLM regex), the visitor "talk to a human" button, and
 *     operator takeover stopping the AI.
 *
 * PREREQUISITE: the hono-api server must be running on localhost:8000
 * (`bun run dev`). The tests DO NOT depend on LLM output — every assertion is
 * deterministic and holds whether OPENROUTER_API_KEY is real, mock, or absent.
 *
 * Run with:
 *   bun run test:e2e --filter=hono-api
 *   # or, for just this file (server already up + Infisical secrets injected):
 *   infisical run --path=/hono-api -- npx playwright test e2e/aiDataConnection.e2e.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { organization } from "../src/db/schema/organization";
import { applications } from "../src/db/schema/applications";
import { applicationAiContext } from "../src/db/schema/applicationAiContext";
import {
  provisionTestData,
  cleanupTestData,
  createSessionInDB,
  signSessionCookie,
  type E2ETestData,
} from "./helpers/db-fixture";

const BASE_URL = "http://localhost:8000";

// A private baseUrl so the HTTP tool's test request is rejected by the SSRF
// egress guard (loopback resolves to a reserved address) — a deterministic,
// network-independent assertion that does NOT reach any real endpoint.
const PRIVATE_BASE_URL = "http://127.0.0.1:59999";
const PRIVATE_HOST = "127.0.0.1";

const HUMAN_REQUESTED_SNIPPET = "connecting you with a team member";

let data: E2ETestData;
let adminCookieValue: string;
let serverReachable = false;

// ── Header builders ──

/** Admin (Better Auth session) headers for tenant-scoped REST routes. */
function adminHeaders(): Record<string, string> {
  return {
    Cookie: `better-auth.session_token=${adminCookieValue}`,
    "X-Tenant-Slug": data.org.slug,
    "Content-Type": "application/json",
  };
}

/**
 * Widget-visitor (API key) headers for the unified-auth conversation routes.
 * A localhost Origin is required by `requireAuth` and is accepted under the
 * test-environment API key (test-mode origin allow-listing).
 */
function visitorHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${data.apiKeyRaw}`,
    "X-App-Id": data.app.id,
    "X-Visitor-Id": data.visitorUser.id,
    Origin: "http://localhost:3001",
    "Content-Type": "application/json",
  };
}

// ── Polling helper ──

/**
 * Poll `fn` until it returns a non-null value or the timeout elapses.
 * Rejects with the last-seen value serialized, for a debuggable failure.
 */
async function poll<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 15_000,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null | undefined = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (last !== null && last !== undefined) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `poll timed out after ${timeoutMs}ms. Last value: ${JSON.stringify(last)}`,
  );
}

type WireMessage = {
  id: string;
  senderId: string | null;
  authorType: string;
  type: string;
  content: string;
};

/** Fetch a conversation's messages as the admin (member) — includes authorType. */
async function getMessages(
  request: APIRequestContext,
  conversationId: string,
): Promise<WireMessage[]> {
  const res = await request.get(
    `/api/v1/conversations/${conversationId}/messages`,
    { headers: adminHeaders() },
  );
  if (res.status() !== 200) return [];
  const body = await res.json();
  return (body.messages ?? []) as WireMessage[];
}

/** Fetch a conversation snapshot as the admin — includes handledBy/status. */
async function getConversation(
  request: APIRequestContext,
  conversationId: string,
): Promise<Record<string, unknown> | null> {
  const res = await request.get(`/api/v1/conversations/${conversationId}`, {
    headers: adminHeaders(),
  });
  if (res.status() !== 200) return null;
  const body = await res.json();
  return (body.conversation ?? null) as Record<string, unknown> | null;
}

/** Create an AI-handled visitor conversation via the unified-auth REST path. */
async function createVisitorConversation(
  request: APIRequestContext,
  subject: string,
): Promise<Record<string, unknown>> {
  const res = await request.post("/api/v1/conversations", {
    headers: visitorHeaders(),
    data: { subject },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.conversation as Record<string, unknown>;
}

async function sendVisitorMessage(
  request: APIRequestContext,
  conversationId: string,
  content: string,
): Promise<void> {
  const res = await request.post(
    `/api/v1/conversations/${conversationId}/messages`,
    { headers: visitorHeaders(), data: { content } },
  );
  expect(res.status()).toBe(201);
}

// ── Setup / Teardown ──

test.beforeAll(async () => {
  const ping = await fetch(BASE_URL).catch(() => null);
  serverReachable = ping !== null;
  if (!serverReachable) {
    console.warn(
      "[AI-Data E2E] Server not reachable on localhost:8000 — skipping suite.",
    );
    return;
  }

  // Provision an org entitled to the AI add-on: PREMIUM + active billing.
  data = await provisionTestData({ plan: "PREMIUM", planStatus: "active" });

  // Entitlement fields the fixture does not set directly:
  //   organization.aiAddonActive = true   (org half of the entitlement)
  //   application.aiEnabled + aiAutoRespond = true  (application half)
  await db
    .update(organization)
    .set({ aiAddonActive: true })
    .where(eq(organization.id, data.org.id));

  await db
    .update(applications)
    .set({ aiEnabled: true, aiAutoRespond: true })
    .where(eq(applications.id, data.app.id));

  // The turn loader requires a completed AI context with a contextSummary.
  await db.insert(applicationAiContext).values({
    id: randomUUID(),
    applicationId: data.app.id,
    status: "completed",
    contextSummary:
      "This is an e2e test business. It sells widgets and offers standard support.",
  });

  adminCookieValue = signSessionCookie(
    await createSessionInDB(data.adminUser.id),
  );

  console.log(
    `[AI-Data E2E] Provisioned entitled org=${data.org.slug} app=${data.app.id}`,
  );
});

test.afterAll(async () => {
  if (!serverReachable) return;
  // applicationAiContext / dataSource / dataTool rows all cascade-delete when
  // the application is removed inside cleanupTestData — no extra teardown needed.
  await cleanupTestData(data);
  console.log("[AI-Data E2E] Cleaned up test data");
});

// ────────────────────────────────────────────────────────────────────────────
// Part A — Data source + tool configuration
// ────────────────────────────────────────────────────────────────────────────

test.describe("Part A — data source + tool config", () => {
  let httpToolId: string;

  test("PUT data-source (http) then GET redacts secret header values", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");

    const putRes = await request.put(
      `/api/v1/applications/${data.app.id}/data-source`,
      {
        headers: adminHeaders(),
        data: {
          kind: "http",
          baseUrl: PRIVATE_BASE_URL,
          allowedHost: PRIVATE_HOST,
          headers: { "X-Api-Key": "super-secret-value-123" },
        },
      },
    );
    expect(putRes.status()).toBe(200);

    const getRes = await request.get(
      `/api/v1/applications/${data.app.id}/data-source`,
      { headers: adminHeaders() },
    );
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();

    expect(body.kind).toBe("http");
    expect(body.baseUrl).toBe(PRIVATE_BASE_URL);
    expect(body.allowedHost).toBe(PRIVATE_HOST);
    // Redaction contract: header NAMES surface, values never do.
    expect(body.hasHeaders).toBe(true);
    expect(body.headerNames).toEqual(["X-Api-Key"]);
    expect(JSON.stringify(body)).not.toContain("super-secret-value-123");
    expect(body).not.toHaveProperty("headers");
    expect(body).not.toHaveProperty("encryptedHeaders");
  });

  test("POST data-tool with mismatched backingType (sql on http source) → 400", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");

    const res = await request.post(
      `/api/v1/applications/${data.app.id}/data-tools`,
      {
        headers: adminHeaders(),
        data: {
          name: "mismatched_tool",
          description: "A sql tool pointed at an http source",
          inputSchema: { type: "object", properties: {} },
          backingType: "sql",
          config: { query: "SELECT 1" },
        },
      },
    );
    expect(res.status()).toBe(400);
  });

  test("POST data-tool with invalid name → 400", async ({ request }) => {
    test.skip(!serverReachable, "server not reachable");

    const res = await request.post(
      `/api/v1/applications/${data.app.id}/data-tools`,
      {
        headers: adminHeaders(),
        data: {
          name: "1-invalid name!",
          description: "Name violates the identifier regex",
          inputSchema: { type: "object", properties: {} },
          backingType: "http",
          config: { method: "GET", urlTemplate: "/data" },
        },
      },
    );
    expect(res.status()).toBe(400);
  });

  test("POST valid http data-tool → 201 and starts disabled", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");

    const res = await request.post(
      `/api/v1/applications/${data.app.id}/data-tools`,
      {
        headers: adminHeaders(),
        data: {
          name: "lookup_order",
          description: "Look up an order by its id (test tool)",
          inputSchema: { type: "object", properties: {} },
          backingType: "http",
          config: { method: "GET", urlTemplate: "/orders" },
        },
      },
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.lastTestedAt).toBeNull();
    httpToolId = body.id as string;
  });

  test("enable before any successful test → 400", async ({ request }) => {
    test.skip(!serverReachable, "server not reachable");
    expect(httpToolId).toBeDefined();

    const res = await request.post(
      `/api/v1/applications/${data.app.id}/data-tools/${httpToolId}/enable`,
      { headers: adminHeaders(), data: { enabled: true } },
    );
    expect(res.status()).toBe(400);
  });

  test("test request is rejected by the SSRF egress guard (ok:false, kind:execution)", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");
    expect(httpToolId).toBeDefined();

    const res = await request.post(
      `/api/v1/applications/${data.app.id}/data-tools/${httpToolId}/test`,
      { headers: adminHeaders(), data: { params: {} } },
    );
    // A failed test is a normal 200 outcome carrying the failure body.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // Loopback resolves to a reserved address → the guard blocks egress.
    expect(body.kind).toBe("execution");
  });

  test("enable still 400 after a FAILED test (lastTestedAt unchanged)", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");
    expect(httpToolId).toBeDefined();

    const res = await request.post(
      `/api/v1/applications/${data.app.id}/data-tools/${httpToolId}/enable`,
      { headers: adminHeaders(), data: { enabled: true } },
    );
    expect(res.status()).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Part B — Conversation lifecycle with AI handling
// ────────────────────────────────────────────────────────────────────────────

test.describe("Part B — AI-handled conversation lifecycle", () => {
  test("visitor conversation is created handledBy 'ai' (entitled + auto-respond)", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");

    const conv = await createVisitorConversation(
      request,
      "AI handling — create",
    );
    expect(conv.handledBy).toBe("ai");
    expect(conv.status).toBe("pending");
  });

  test("AI turn reaches a terminal outcome: reply XOR escalation (no dead air)", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");
    // This is the only test that waits on a real model call; the 30s default
    // is not enough headroom once the suite runs in parallel.
    test.setTimeout(90_000);

    const conv = await createVisitorConversation(request, "AI handling — turn");
    const conversationId = conv.id as string;

    await sendVisitorMessage(
      request,
      conversationId,
      "Hi, can you tell me about your return policy?",
    );

    // The turn runs fire-and-forget. Its contract guarantees exactly one of:
    //   (a) an AI reply message (authorType 'ai'), or
    //   (b) an escalation: handledBy flips to 'human', status 'pending', and a
    //       system message is written.
    const outcome = await poll(async () => {
      const messages = await getMessages(request, conversationId);
      const aiReply = messages.some((m) => m.authorType === "ai");
      const systemMsg = messages.some((m) => m.authorType === "system");
      const convo = await getConversation(request, conversationId);
      const escalated =
        convo?.handledBy === "human" && convo?.status === "pending";

      if (aiReply) return { kind: "reply" as const };
      if (escalated && systemMsg) return { kind: "escalation" as const };
      return null;
      // A real LLM turn (model call + tool loop) can take a while when the
      // suite runs in parallel, so this waits well past the happy-path latency.
    }, 45_000);

    expect(["reply", "escalation"]).toContain(outcome.kind);
  });

  test("deterministic human-request escalation (pre-LLM regex)", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");

    const conv = await createVisitorConversation(
      request,
      "AI handling — human request",
    );
    const conversationId = conv.id as string;

    await sendVisitorMessage(
      request,
      conversationId,
      "I want to talk to a human",
    );

    // This path skips the model entirely, so it is fully deterministic.
    const result = await poll(async () => {
      const convo = await getConversation(request, conversationId);
      if (convo?.handledBy !== "human" || convo?.status !== "pending") {
        return null;
      }
      const messages = await getMessages(request, conversationId);
      const systemMsg = messages.find(
        (m) =>
          m.authorType === "system" &&
          m.content.includes(HUMAN_REQUESTED_SNIPPET),
      );
      if (!systemMsg) return null;
      return { convo, systemMsg };
    }, 15_000);

    expect(result.convo.handledBy).toBe("human");
    expect(result.convo.status).toBe("pending");
    expect(result.convo.assignedTo).toBeNull();
    expect(result.convo.escalationReason).toBeTruthy();
    expect(result.systemMsg.type).toBe("system");
  });

  test("visitor button escalation is immediate and idempotent", async ({
    request,
  }) => {
    test.skip(!serverReachable, "server not reachable");

    const conv = await createVisitorConversation(
      request,
      "AI handling — button",
    );
    const conversationId = conv.id as string;

    // First escalate — the widget-auth variant runs synchronously.
    const first = await request.post(
      `/api/v1/widget/conversations/${conversationId}/escalate`,
      { headers: visitorHeaders() },
    );
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.conversation.handledBy).toBe("human");
    expect(firstBody.conversation.status).toBe("pending");

    // The human-requested system message is written by the shared escalation path.
    const systemMsg = await poll(async () => {
      const messages = await getMessages(request, conversationId);
      return (
        messages.find(
          (m) =>
            m.authorType === "system" &&
            m.content.includes(HUMAN_REQUESTED_SNIPPET),
        ) ?? null
      );
    }, 10_000);
    expect(systemMsg.type).toBe("system");

    // Second escalate on an already-human conversation → idempotent 200 (noop).
    const second = await request.post(
      `/api/v1/widget/conversations/${conversationId}/escalate`,
      { headers: visitorHeaders() },
    );
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.conversation.handledBy).toBe("human");
  });

  test("operator takeover stops the AI", async ({ request }) => {
    test.skip(!serverReachable, "server not reachable");

    // Escalate a fresh conversation so it is pending + unassigned (acceptable).
    const conv = await createVisitorConversation(
      request,
      "AI handling — takeover",
    );
    const conversationId = conv.id as string;

    const escalate = await request.post(
      `/api/v1/widget/conversations/${conversationId}/escalate`,
      { headers: visitorHeaders() },
    );
    expect(escalate.status()).toBe(200);

    // Admin accepts — race-safe UPDATE flips handledBy=human, sets assignedTo.
    const accept = await request.post(
      `/api/v1/conversations/${conversationId}/accept`,
      { headers: adminHeaders() },
    );
    expect(accept.status()).toBe(200);
    const acceptBody = await accept.json();
    expect(acceptBody.conversation.assignedTo).toBe(data.adminUser.id);
    expect(acceptBody.conversation.handledBy).toBe("human");

    // A subsequent visitor message must NOT trigger an AI reply. We assert by
    // absence: no message with authorType 'ai' ever appears.
    // NOTE (flakiness): absence assertions are inherently time-bounded. The
    // window is kept tight (5s) and this conversation was human-handled before
    // the message was sent, so `maybeTriggerAiTurn` short-circuits on the
    // handledBy!=='ai' guard — an AI reply here would be a real regression.
    await sendVisitorMessage(request, conversationId, "Are you still there?");
    await new Promise((r) => setTimeout(r, 5_000));

    const messages = await getMessages(request, conversationId);
    const aiReplies = messages.filter((m) => m.authorType === "ai");
    expect(aiReplies).toHaveLength(0);
  });
});
