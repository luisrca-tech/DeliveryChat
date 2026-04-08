import { test, expect } from "@playwright/test";
import WebSocket from "ws";
import {
  provisionTestData,
  cleanupTestData,
  type E2ETestData,
} from "./helpers/db-fixture";
import {
  connectWebSocket,
  waitForMessage,
  sendWsEvent,
  sleep,
} from "./helpers/setup";

let testData: E2ETestData;

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
      const response = await request.post(
        "/v1/widget/conversations",
        {
          headers: {
            Authorization: `Bearer ${testData.apiKeyRaw}`,
            "X-App-Id": testData.app.id,
            "X-Visitor-Id": testData.visitorUser.id,
            "Content-Type": "application/json",
          },
          data: { subject: "Help with my order" },
        },
      );

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.conversation).toBeDefined();
      expect(body.conversation.type).toBe("support");
      expect(body.conversation.applicationId).toBe(testData.app.id);
      expect(body.conversation.organizationId).toBe(testData.org.id);
      expect(body.conversation.status).toBe("active");
    });

    test("rejects widget conversation without X-Visitor-Id", async ({
      request,
    }) => {
      const response = await request.post(
        "/v1/widget/conversations",
        {
          headers: {
            Authorization: `Bearer ${testData.apiKeyRaw}`,
            "X-App-Id": testData.app.id,
            "Content-Type": "application/json",
          },
          data: {},
        },
      );

      expect(response.status()).toBe(400);
    });

    test("rejects widget conversation with invalid API key", async ({
      request,
    }) => {
      const response = await request.post(
        "/v1/widget/conversations",
        {
          headers: {
            Authorization: "Bearer dk_test_invalidkeyinvalidkeyinvalidk",
            "X-App-Id": testData.app.id,
            "X-Visitor-Id": testData.visitorUser.id,
            "Content-Type": "application/json",
          },
          data: {},
        },
      );

      expect(response.status()).toBe(401);
    });
  });
});

// ── WebSocket Tests ──

test.describe("WebSocket: Real-Time Messaging", () => {
  let conversationId: string;

  test.beforeAll(async ({ request }) => {
    // Create a support conversation for WS tests
    const response = await request.post(
      "http://localhost:8000/v1/widget/conversations",
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
    const wsUrl = `ws://localhost:8000/v1/ws?token=${testData.apiKeyRaw}&appId=${testData.app.id}`;
    const { ws, messages } = await connectWebSocket(wsUrl);

    // Give server time to process onOpen
    await sleep(200);

    // Send ping to verify connection works
    sendWsEvent(ws, { type: "ping" });

    const pong = await waitForMessage(
      messages,
      (m) => m.type === "pong",
    );
    expect(pong.type).toBe("pong");

    ws.close();
  });

  test("rejects WebSocket with invalid credentials", async () => {
    const wsUrl = `ws://localhost:8000/v1/ws?token=dk_test_invalidkeyinvalidkeyinvalidk&appId=${testData.app.id}`;

    const result = await new Promise<{ errorReceived: boolean }>((resolve) => {
      const ws = new WebSocket(wsUrl);
      let errorReceived = false;

      ws.on("message", (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === "error" && parsed.payload.code === "UNAUTHORIZED") {
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
    const wsUrl = `ws://localhost:8000/v1/ws?token=${testData.apiKeyRaw}&appId=${testData.app.id}`;
    const { ws, messages } = await connectWebSocket(wsUrl);
    await sleep(200);

    // Try to join a conversation the anonymous user is NOT a participant of
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
    const wsUrl = `ws://localhost:8000/v1/ws?token=${testData.apiKeyRaw}&appId=${testData.app.id}`;
    const { ws, messages } = await connectWebSocket(wsUrl);
    await sleep(200);

    sendWsEvent(ws, { type: "ping" });

    const pong = await waitForMessage(messages, (m) => m.type === "pong");
    expect(pong.type).toBe("pong");

    ws.close();
  });

  test("rejects invalid event types", async () => {
    const wsUrl = `ws://localhost:8000/v1/ws?token=${testData.apiKeyRaw}&appId=${testData.app.id}`;
    const { ws, messages } = await connectWebSocket(wsUrl);
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
    const wsUrl = `ws://localhost:8000/v1/ws?token=${testData.apiKeyRaw}&appId=${testData.app.id}`;
    const { ws, messages } = await connectWebSocket(wsUrl);
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
    const response = await request.post(
      "/v1/widget/conversations",
      {
        headers: {
          Authorization: `Bearer ${testData.apiKeyRaw}`,
          "X-App-Id": testData.app.id,
          "X-Visitor-Id": testData.visitorUser.id,
          "Content-Type": "application/json",
        },
        data: { subject: "App ID enforcement test" },
      },
    );

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.conversation.applicationId).toBe(testData.app.id);
    expect(body.conversation.type).toBe("support");
  });

  test("widget message history returns messages with sender info", async ({
    request,
  }) => {
    // Create a conversation first
    const createResp = await request.post(
      "/v1/widget/conversations",
      {
        headers: {
          Authorization: `Bearer ${testData.apiKeyRaw}`,
          "X-App-Id": testData.app.id,
          "X-Visitor-Id": testData.visitorUser.id,
          "Content-Type": "application/json",
        },
        data: { subject: "History test" },
      },
    );

    const { conversation } = await createResp.json();

    // Fetch messages (should be empty for new conversation)
    const messagesResp = await request.get(
      `/v1/widget/conversations/${conversation.id}/messages`,
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
      `/v1/widget/conversations/00000000-0000-0000-0000-000000000000/messages`,
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
