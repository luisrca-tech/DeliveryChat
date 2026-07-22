import { test, expect } from "@playwright/test";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import {
  provisionTestData,
  cleanupTestData,
  createConversationInDB,
  addParticipantInDB,
  createSessionInDB,
  signSessionCookie,
  signVisitorWsToken,
  type E2ETestData,
} from "./helpers/db-fixture";
import {
  connectWebSocket,
  waitForMessage,
  sendWsEvent,
  joinRoomAndSettle,
  sleep,
} from "./helpers/setup";

/**
 * How long to let WebSocket connections settle before asserting on traffic.
 * Staff auth costs extra DB round-trips (session → org → membership) on top of
 * the visitor path, so a short wait races: their `room:join` can land after a
 * message has already been broadcast, and they miss it.
 */
const WS_SETTLE_MS = 1000;

let testData: E2ETestData;
let operatorSessionToken: string;
let adminSessionToken: string;

test.beforeAll(async () => {
  testData = await provisionTestData();
  operatorSessionToken = await createSessionInDB(testData.operatorUser.id);
  adminSessionToken = await createSessionInDB(testData.adminUser.id);
  console.log(`[E2E Flows] Test data provisioned: org=${testData.org.slug}`);
});

test.afterAll(async () => {
  await cleanupTestData(testData);
  console.log(`[E2E Flows] Test data cleaned up`);
});

// ── Helper to build WS URLs ──
//
// The WS endpoint has two auth paths (see wsAuth.ts):
//   - visitors  → `token`, a signed WS token binding appId + visitorId + origin
//   - staff     → `sessionToken` (a Better Auth session) + `tenant` (org slug)
// Staff must NOT borrow the visitor path: it would resolve them with role
// "visitor", and role-sensitive assertions would silently test the wrong thing.

function visitorWsUrl(visitorId: string) {
  const token = signVisitorWsToken({ appId: testData.app.id, visitorId });
  return `ws://localhost:8000/api/v1/ws?token=${encodeURIComponent(token)}`;
}

function staffWsUrl(sessionToken: string) {
  // wsAuth promotes `sessionToken` to `Authorization: Bearer …`, and Better
  // Auth's bearer plugin runs that value through the signed-cookie verifier —
  // which expects the percent-encoded signed form. Hono decodes the query
  // param once, so it has to be encoded twice to survive intact.
  const bearer = encodeURIComponent(signSessionCookie(sessionToken));
  return `ws://localhost:8000/api/v1/ws?sessionToken=${bearer}&tenant=${encodeURIComponent(
    testData.org.slug,
  )}`;
}

function operatorWsUrl() {
  return staffWsUrl(operatorSessionToken);
}

function adminWsUrl() {
  return staffWsUrl(adminSessionToken);
}

// ── Flow 1: Visitor ↔ Operator (Support) ──

test.describe("Flow 1: Visitor ↔ Operator (Support Conversation)", () => {
  let conversationId: string;

  test.beforeAll(async () => {
    conversationId = await createConversationInDB({
      organizationId: testData.org.id,
      applicationId: testData.app.id,
      subject: "E2E: Visitor needs help",
      participants: [
        { userId: testData.visitorUser.id, role: "visitor" },
        { userId: testData.operatorUser.id, role: "operator" },
      ],
      // The operator has accepted the conversation — required for them to reply.
      assignedTo: testData.operatorUser.id,
      status: "active",
    });
  });

  test("visitor sends message, operator receives it in real-time", async () => {
    // 1. Connect both users
    const visitor = await connectWebSocket(
      visitorWsUrl(testData.visitorUser.id),
    );
    const operator = await connectWebSocket(operatorWsUrl());
    await sleep(500);

    // 2. Both join the conversation room
    await joinRoomAndSettle(visitor.ws, visitor.messages, conversationId);
    await sleep(200);
    await joinRoomAndSettle(operator.ws, operator.messages, conversationId);
    await sleep(500);

    // 3. Visitor sends a message
    sendWsEvent(visitor.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "Hi, I need help with my order!",
        clientMessageId: "visitor-msg-1",
      },
    });

    // 4. Visitor receives ACK
    const ack = await waitForMessage(
      visitor.messages,
      (m) =>
        m.type === "message:ack" &&
        m.payload.clientMessageId === "visitor-msg-1",
      10000,
    );
    expect(ack.payload.serverMessageId).toBeDefined();
    expect(ack.payload.createdAt).toBeDefined();

    // 5. Operator receives the message
    const received = await waitForMessage(
      operator.messages,
      (m) =>
        m.type === "message:new" &&
        m.payload.content === "Hi, I need help with my order!",
      10000,
    );
    expect(received.payload.senderId).toBe(testData.visitorUser.id);
    expect(received.payload.conversationId).toBe(conversationId);

    visitor.ws.close();
    operator.ws.close();
  });

  test("operator responds, visitor receives it in real-time", async () => {
    const visitor = await connectWebSocket(
      visitorWsUrl(testData.visitorUser.id),
    );
    const operator = await connectWebSocket(operatorWsUrl());
    await sleep(WS_SETTLE_MS);

    await joinRoomAndSettle(visitor.ws, visitor.messages, conversationId);
    await joinRoomAndSettle(operator.ws, operator.messages, conversationId);

    // Operator responds
    sendWsEvent(operator.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "Sure, let me check your order status.",
        clientMessageId: "operator-msg-1",
      },
    });

    // Operator gets ACK
    const ack = await waitForMessage(
      operator.messages,
      (m) =>
        m.type === "message:ack" &&
        m.payload.clientMessageId === "operator-msg-1",
    );
    expect(ack.payload.serverMessageId).toBeDefined();

    // Visitor receives operator's message
    const received = await waitForMessage(
      visitor.messages,
      (m) =>
        m.type === "message:new" &&
        m.payload.content === "Sure, let me check your order status.",
    );
    expect(received.payload.senderId).toBe(testData.operatorUser.id);

    visitor.ws.close();
    operator.ws.close();
  });

  test("multiple messages in sequence maintain order", async () => {
    const visitor = await connectWebSocket(
      visitorWsUrl(testData.visitorUser.id),
    );
    const operator = await connectWebSocket(operatorWsUrl());
    await sleep(WS_SETTLE_MS);

    await joinRoomAndSettle(visitor.ws, visitor.messages, conversationId);
    await joinRoomAndSettle(operator.ws, operator.messages, conversationId);

    // Send 3 messages in sequence
    for (let i = 1; i <= 3; i++) {
      sendWsEvent(visitor.ws, {
        type: "message:send",
        payload: {
          conversationId,
          content: `Message ${i}`,
          clientMessageId: `seq-msg-${i}`,
        },
      });
      // Small delay to ensure ordering
      await sleep(100);
    }

    // Operator should receive all 3
    const msg1 = await waitForMessage(
      operator.messages,
      (m) => m.type === "message:new" && m.payload.content === "Message 1",
    );
    const msg2 = await waitForMessage(
      operator.messages,
      (m) => m.type === "message:new" && m.payload.content === "Message 2",
    );
    const msg3 = await waitForMessage(
      operator.messages,
      (m) => m.type === "message:new" && m.payload.content === "Message 3",
    );

    expect(msg1).toBeDefined();
    expect(msg2).toBeDefined();
    expect(msg3).toBeDefined();

    visitor.ws.close();
    operator.ws.close();
  });
});

// ── Flow 2: Operator ↔ Admin (Internal) ──

test.describe("Flow 2: Operator ↔ Admin (Internal Conversation)", () => {
  let conversationId: string;

  test.beforeAll(async () => {
    conversationId = await createConversationInDB({
      organizationId: testData.org.id,
      subject: "E2E: Internal team discussion",
      participants: [
        { userId: testData.operatorUser.id, role: "operator" },
        { userId: testData.adminUser.id, role: "admin" },
      ],
    });
  });

  test("operator and admin exchange messages in internal conversation", async () => {
    const operator = await connectWebSocket(operatorWsUrl());
    const admin = await connectWebSocket(adminWsUrl());
    await sleep(WS_SETTLE_MS);

    await joinRoomAndSettle(operator.ws, operator.messages, conversationId);
    await joinRoomAndSettle(admin.ws, admin.messages, conversationId);

    // Operator sends
    sendWsEvent(operator.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "Customer #42 is escalating, can you help?",
        clientMessageId: "internal-op-1",
      },
    });

    // Admin receives
    const opMsg = await waitForMessage(
      admin.messages,
      (m) =>
        m.type === "message:new" && m.payload.content.includes("Customer #42"),
    );
    expect(opMsg.payload.senderId).toBe(testData.operatorUser.id);

    // Admin responds
    sendWsEvent(admin.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "On it, I will join the support conversation now.",
        clientMessageId: "internal-admin-1",
      },
    });

    // Operator receives
    const adminMsg = await waitForMessage(
      operator.messages,
      (m) => m.type === "message:new" && m.payload.content.includes("On it"),
    );
    expect(adminMsg.payload.senderId).toBe(testData.adminUser.id);

    operator.ws.close();
    admin.ws.close();
  });

  test("internal conversation does not require applicationId", async () => {
    // The conversation was created without applicationId — verify it works
    const operator = await connectWebSocket(operatorWsUrl());
    await sleep(WS_SETTLE_MS);

    await joinRoomAndSettle(operator.ws, operator.messages, conversationId);
    await sleep(200);

    sendWsEvent(operator.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "No applicationId needed for internal",
        clientMessageId: "internal-no-app",
      },
    });

    const ack = await waitForMessage(
      operator.messages,
      (m) =>
        m.type === "message:ack" &&
        m.payload.clientMessageId === "internal-no-app",
    );
    expect(ack.payload.serverMessageId).toBeDefined();

    operator.ws.close();
  });
});

// ── Flow 3: Admin Escalation (iFood Model) ──

test.describe("Flow 3: Admin Escalation into Support Conversation", () => {
  let supportConvId: string;

  test.beforeAll(async () => {
    // Create a support conversation with visitor + operator
    supportConvId = await createConversationInDB({
      organizationId: testData.org.id,
      applicationId: testData.app.id,
      subject: "E2E: Escalation scenario",
      participants: [
        { userId: testData.visitorUser.id, role: "visitor" },
        { userId: testData.operatorUser.id, role: "operator" },
      ],
    });
  });

  test("admin cannot join before being added as participant", async () => {
    const admin = await connectWebSocket(adminWsUrl());
    await sleep(WS_SETTLE_MS);

    await joinRoomAndSettle(admin.ws, admin.messages, supportConvId);

    const error = await waitForMessage(
      admin.messages,
      (m) => m.type === "error" && m.payload.code === "FORBIDDEN",
    );
    expect(error.payload.message).toContain("Not a participant");

    admin.ws.close();
  });

  test("admin joins after being added as participant and receives messages", async () => {
    // 1. Add admin as participant (simulates the escalation action via REST)
    await addParticipantInDB(supportConvId, testData.adminUser.id, "admin");

    // 2. Connect all three
    const visitor = await connectWebSocket(
      visitorWsUrl(testData.visitorUser.id),
    );
    const operator = await connectWebSocket(operatorWsUrl());
    const admin = await connectWebSocket(adminWsUrl());
    await sleep(WS_SETTLE_MS);

    // 3. All join the room
    await joinRoomAndSettle(visitor.ws, visitor.messages, supportConvId);
    await joinRoomAndSettle(operator.ws, operator.messages, supportConvId);
    await joinRoomAndSettle(admin.ws, admin.messages, supportConvId);

    // 4. Visitor sends a message — both operator AND admin should receive it
    sendWsEvent(visitor.ws, {
      type: "message:send",
      payload: {
        conversationId: supportConvId,
        content: "I have been waiting too long for my delivery!",
        clientMessageId: "escalation-visitor-1",
      },
    });

    // Operator receives
    const opReceived = await waitForMessage(
      operator.messages,
      (m) =>
        m.type === "message:new" &&
        m.payload.content.includes("waiting too long"),
    );
    expect(opReceived.payload.senderId).toBe(testData.visitorUser.id);

    // Admin receives too
    const adminReceived = await waitForMessage(
      admin.messages,
      (m) =>
        m.type === "message:new" &&
        m.payload.content.includes("waiting too long"),
    );
    expect(adminReceived.payload.senderId).toBe(testData.visitorUser.id);

    // 5. Admin responds directly to visitor
    sendWsEvent(admin.ws, {
      type: "message:send",
      payload: {
        conversationId: supportConvId,
        content:
          "I apologize for the delay. I am a manager and will handle this personally.",
        clientMessageId: "escalation-admin-1",
      },
    });

    // Visitor receives admin's message
    const visitorReceived = await waitForMessage(
      visitor.messages,
      (m) =>
        m.type === "message:new" &&
        m.payload.content.includes("I am a manager"),
    );
    expect(visitorReceived.payload.senderId).toBe(testData.adminUser.id);

    // Operator also receives admin's message
    const opReceivedAdmin = await waitForMessage(
      operator.messages,
      (m) =>
        m.type === "message:new" &&
        m.payload.content.includes("I am a manager"),
    );
    expect(opReceivedAdmin.payload.senderId).toBe(testData.adminUser.id);

    visitor.ws.close();
    operator.ws.close();
    admin.ws.close();
  });
});

// ── Flow 4: Reconnection with Missed Messages ──

test.describe("Flow 4: Reconnection and Message Sync", () => {
  let conversationId: string;

  test.beforeAll(async () => {
    conversationId = await createConversationInDB({
      organizationId: testData.org.id,
      applicationId: testData.app.id,
      subject: "E2E: Reconnection test",
      participants: [
        { userId: testData.visitorUser.id, role: "visitor" },
        { userId: testData.operatorUser.id, role: "operator" },
      ],
      assignedTo: testData.operatorUser.id,
      status: "active",
    });
  });

  test("visitor reconnects and receives missed messages via messages:sync", async () => {
    // 1. Visitor connects and joins
    const visitor1 = await connectWebSocket(
      visitorWsUrl(testData.visitorUser.id),
    );
    const operator = await connectWebSocket(operatorWsUrl());
    await sleep(WS_SETTLE_MS);

    await joinRoomAndSettle(visitor1.ws, visitor1.messages, conversationId);
    await joinRoomAndSettle(operator.ws, operator.messages, conversationId);

    // 2. Visitor sends a message to establish a known messageId
    sendWsEvent(visitor1.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "First message before disconnect",
        clientMessageId: "reconnect-first",
      },
    });

    const firstAck = await waitForMessage(
      visitor1.messages,
      (m) =>
        m.type === "message:ack" &&
        m.payload.clientMessageId === "reconnect-first",
    );
    const lastKnownMessageId = firstAck.payload.serverMessageId;

    // 3. Visitor disconnects
    visitor1.ws.close();
    await sleep(200);

    // 4. Operator sends messages while visitor is offline
    sendWsEvent(operator.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "Missed message 1: checking your order",
        clientMessageId: "missed-1",
      },
    });
    await sleep(200);

    sendWsEvent(operator.ws, {
      type: "message:send",
      payload: {
        conversationId,
        content: "Missed message 2: found the issue",
        clientMessageId: "missed-2",
      },
    });
    await sleep(200);

    // 5. Visitor reconnects with lastMessageId
    const visitor2 = await connectWebSocket(
      visitorWsUrl(testData.visitorUser.id),
    );
    await sleep(WS_SETTLE_MS);

    sendWsEvent(visitor2.ws, {
      type: "room:join",
      payload: { conversationId, lastMessageId: lastKnownMessageId },
    });

    // 6. Visitor should receive messages:sync with missed messages
    const sync = await waitForMessage(
      visitor2.messages,
      (m) => m.type === "messages:sync",
      10000,
    );
    expect(sync.payload.conversationId).toBe(conversationId);
    expect(sync.payload.messages.length).toBeGreaterThanOrEqual(2);

    const contents = sync.payload.messages.map((m: any) => m.content);
    expect(contents).toContain("Missed message 1: checking your order");
    expect(contents).toContain("Missed message 2: found the issue");

    visitor2.ws.close();
    operator.ws.close();
  });
});

// ── Flow 5: Room Isolation ──

test.describe("Flow 5: Room Isolation Between Conversations", () => {
  let convA: string;
  let convB: string;

  test.beforeAll(async () => {
    // Two separate support conversations
    convA = await createConversationInDB({
      organizationId: testData.org.id,
      applicationId: testData.app.id,
      subject: "E2E: Isolation Conv A",
      participants: [
        { userId: testData.visitorUser.id, role: "visitor" },
        { userId: testData.operatorUser.id, role: "operator" },
      ],
    });

    convB = await createConversationInDB({
      organizationId: testData.org.id,
      applicationId: testData.app.id,
      subject: "E2E: Isolation Conv B",
      participants: [
        { userId: testData.operatorUser.id, role: "operator" },
        { userId: testData.adminUser.id, role: "admin" },
      ],
    });
  });

  test("messages in one room do not leak to another room", async () => {
    const visitor = await connectWebSocket(
      visitorWsUrl(testData.visitorUser.id),
    );
    const operator = await connectWebSocket(operatorWsUrl());
    const admin = await connectWebSocket(adminWsUrl());
    // An unrelated visitor, participant of nothing — the isolation probe.
    const stranger = await connectWebSocket(visitorWsUrl(randomUUID()));

    // Visitor joins Conv A, Admin joins Conv B, Operator joins both
    await joinRoomAndSettle(visitor.ws, visitor.messages, convA);
    await joinRoomAndSettle(operator.ws, operator.messages, convA);
    await joinRoomAndSettle(operator.ws, operator.messages, convB);
    await joinRoomAndSettle(admin.ws, admin.messages, convB);

    // Send a message in Conv A
    sendWsEvent(visitor.ws, {
      type: "message:send",
      payload: {
        conversationId: convA,
        content: "This is ONLY for Conv A",
        clientMessageId: "isolation-a",
      },
    });

    // Operator should receive it (they're in Conv A)
    const opReceived = await waitForMessage(
      operator.messages,
      (m) =>
        m.type === "message:new" &&
        m.payload.content === "This is ONLY for Conv A",
    );
    expect(opReceived).toBeDefined();

    // A visitor who is not a participant of Conv A must never see it. This is
    // the isolation guarantee that matters: staff are deliberately excluded
    // from it — `message:send` also calls broadcastToStaff() so every operator
    // and admin in the org gets live inbox updates, so the admin connection
    // here is NOT a valid isolation probe.
    await sleep(500);
    const strangerGotConvAMessage = stranger.messages.some((raw) => {
      try {
        const m = JSON.parse(raw);
        return (
          m.type === "message:new" &&
          m.payload.content === "This is ONLY for Conv A"
        );
      } catch {
        return false;
      }
    });
    expect(strangerGotConvAMessage).toBe(false);

    visitor.ws.close();
    operator.ws.close();
    admin.ws.close();
    stranger.ws.close();
  });
});
