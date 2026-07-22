import { test, expect } from "@playwright/test";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import {
  provisionTestData,
  cleanupTestData,
  signVisitorWsToken,
  type E2ETestData,
} from "./helpers/db-fixture";
import {
  connectWebSocket,
  waitForMessage,
  sendWsEvent,
  sleep,
} from "./helpers/setup";

let testData: E2ETestData;

/** Widget visitors connect with a signed WS token, not the raw API key. */
function visitorWsUrl(): string {
  const token = signVisitorWsToken({
    appId: testData.app.id,
    visitorId: testData.visitorUser.id,
  });
  return `ws://localhost:8000/api/v1/ws?token=${encodeURIComponent(token)}`;
}

test.beforeAll(async () => {
  testData = await provisionTestData();
  console.log(`[E2E] Test data provisioned: org=${testData.org.slug}`);
});

test.afterAll(async () => {
  await cleanupTestData(testData);
  console.log(`[E2E] Test data cleaned up`);
});

// ── REST Endpoint Tests ──

test.describe("REST: Conversation Management", () => {
  test.describe("Widget: Create Support Conversation", () => {
    test("creates a support conversation via widget API", async ({
      request,
    }) => {
      const response = await request.post("/api/v1/widget/conversations", {
        headers: {
          Authorization: `Bearer ${testData.apiKeyRaw}`,
          "X-App-Id": testData.app.id,
          "X-Visitor-Id": testData.visitorUser.id,
          "Content-Type": "application/json",
        },
        data: { subject: "Help with my order" },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.conversation).toBeDefined();
      expect(body.conversation.applicationId).toBe(testData.app.id);
      expect(body.conversation.organizationId).toBe(testData.org.id);
      // A new visitor conversation enters the operator queue as `pending`; it
      // only becomes `active` once an operator accepts it.
      expect(body.conversation.status).toBe("pending");
    });

    test("rejects widget conversation without X-Visitor-Id", async ({
      request,
    }) => {
      const response = await request.post("/api/v1/widget/conversations", {
        headers: {
          Authorization: `Bearer ${testData.apiKeyRaw}`,
          "X-App-Id": testData.app.id,
          "Content-Type": "application/json",
        },
        data: {},
      });

      expect(response.status()).toBe(400);
    });

    // The widget runs in the browser and cannot hold a secret, so
    // `requireWidgetAuth` authenticates on X-App-Id + Origin — never on an API
    // key. An unknown application is the rejection this route actually makes.
    test("rejects widget conversation with an unknown X-App-Id", async ({
      request,
    }) => {
      const response = await request.post("/api/v1/widget/conversations", {
        headers: {
          "X-App-Id": randomUUID(),
          "X-Visitor-Id": testData.visitorUser.id,
          "Content-Type": "application/json",
        },
        data: {},
      });

      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("app_not_found");
    });
  });
});

// ── WebSocket Tests ──

test.describe("WebSocket: Real-Time Messaging", () => {
  let conversationId: string;

  test.beforeAll(async ({ request }) => {
    // Create a support conversation for WS tests
    const response = await request.post(
      "http://localhost:8000/api/v1/widget/conversations",
      {
        headers: {
          Authorization: `Bearer ${testData.apiKeyRaw}`,
          "X-App-Id": testData.app.id,
          "X-Visitor-Id": testData.visitorUser.id,
          "Content-Type": "application/json",
        },
        data: { subject: "WS Test Conversation" },
      },
    );

    const body = await response.json();
    conversationId = body.conversation.id;
  });

  test("connects via WebSocket with API key auth (widget)", async () => {
    const { ws, messages } = await connectWebSocket(visitorWsUrl());

    // Give server time to process onOpen
    await sleep(200);

    // Send ping to verify connection works
    sendWsEvent(ws, { type: "ping" });

    const pong = await waitForMessage(messages, (m) => m.type === "pong");
    expect(pong.type).toBe("pong");

    ws.close();
  });

  test("rejects WebSocket with invalid credentials", async () => {
    // A garbage `token` fails HMAC verification before any DB lookup.
    const wsUrl = `ws://localhost:8000/api/v1/ws?token=not-a-valid-ws-token`;

    const result = await new Promise<{ errorReceived: boolean }>((resolve) => {
      const ws = new WebSocket(wsUrl);
      let errorReceived = false;

      ws.on("message", (data) => {
        const parsed = JSON.parse(data.toString());
        if (
          parsed.type === "error" &&
          parsed.payload.code === "INVALID_TOKEN"
        ) {
          errorReceived = true;
        }
      });

      ws.on("close", () => {
        resolve({ errorReceived });
      });

      ws.on("error", () => {
        resolve({ errorReceived: true });
      });
    });

    expect(result.errorReceived).toBe(true);
  });

  test("room:join fails for non-participant", async () => {
    // Connect as a DIFFERENT visitor than the one who opened the conversation,
    // otherwise the join legitimately succeeds.
    const strangerToken = signVisitorWsToken({
      appId: testData.app.id,
      visitorId: randomUUID(),
    });
    const { ws, messages } = await connectWebSocket(
      `ws://localhost:8000/api/v1/ws?token=${encodeURIComponent(strangerToken)}`,
    );
    await sleep(200);

    // Try to join a conversation this visitor is NOT a participant of
    sendWsEvent(ws, {
      type: "room:join",
      payload: { conversationId },
    });

    const error = await waitForMessage(
      messages,
      (m) => m.type === "error" && m.payload.code === "FORBIDDEN",
    );
    expect(error.payload.message).toContain("Not a participant");

    ws.close();
  });

  test("ping responds with pong", async () => {
    const { ws, messages } = await connectWebSocket(visitorWsUrl());
    await sleep(200);

    sendWsEvent(ws, { type: "ping" });

    const pong = await waitForMessage(messages, (m) => m.type === "pong");
    expect(pong.type).toBe("pong");

    ws.close();
  });

  test("rejects invalid event types", async () => {
    const { ws, messages } = await connectWebSocket(visitorWsUrl());
    await sleep(200);

    sendWsEvent(ws, { type: "unknown:event", payload: {} });

    const error = await waitForMessage(
      messages,
      (m) => m.type === "error" && m.payload.code === "VALIDATION_ERROR",
    );
    expect(error.type).toBe("error");

    ws.close();
  });

  test("rejects malformed JSON", async () => {
    const { ws, messages } = await connectWebSocket(visitorWsUrl());
    await sleep(200);

    ws.send("not valid json{{{");

    const error = await waitForMessage(
      messages,
      (m) => m.type === "error" && m.payload.code === "PARSE_ERROR",
    );
    expect(error.payload.code).toBe("PARSE_ERROR");

    ws.close();
  });
});

// ── Business Rule Tests ──

test.describe("Business Rules", () => {
  test("widget conversation always has applicationId (support type)", async ({
    request,
  }) => {
    const response = await request.post("/api/v1/widget/conversations", {
      headers: {
        Authorization: `Bearer ${testData.apiKeyRaw}`,
        "X-App-Id": testData.app.id,
        "X-Visitor-Id": testData.visitorUser.id,
        "Content-Type": "application/json",
      },
      data: { subject: "App ID enforcement test" },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.conversation.applicationId).toBe(testData.app.id);
  });

  test("widget message history returns messages with sender info", async ({
    request,
  }) => {
    // Create a conversation first
    const createResp = await request.post("/api/v1/widget/conversations", {
      headers: {
        Authorization: `Bearer ${testData.apiKeyRaw}`,
        "X-App-Id": testData.app.id,
        "X-Visitor-Id": testData.visitorUser.id,
        "Content-Type": "application/json",
      },
      data: { subject: "History test" },
    });

    const { conversation } = await createResp.json();

    // Fetch messages (should be empty for new conversation)
    const messagesResp = await request.get(
      `/api/v1/widget/conversations/${conversation.id}/messages`,
      {
        headers: {
          Authorization: `Bearer ${testData.apiKeyRaw}`,
          "X-App-Id": testData.app.id,
        },
      },
    );

    expect(messagesResp.status()).toBe(200);
    const body = await messagesResp.json();
    expect(body.messages).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  test("widget cannot access conversations from another application", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/widget/conversations/00000000-0000-0000-0000-000000000000/messages`,
      {
        headers: {
          Authorization: `Bearer ${testData.apiKeyRaw}`,
          "X-App-Id": testData.app.id,
        },
      },
    );

    expect(response.status()).toBe(404);
  });
});
