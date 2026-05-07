import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const TEST_SECRET = "test-ws-token-secret-that-is-at-least-32-chars";
const VALID_APP_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_ORG_ID = "org-1";
const VALID_VISITOR_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const CONVERSATION_ID = "conv-0001-0001-0001-000000000001";
const MESSAGE_ID = "11111111-2222-3333-4444-555555555555";

vi.mock("../../env.js", () => ({
  env: {
    WS_TOKEN_SECRET: TEST_SECRET,
  },
}));

const mockVerifyApiKey = vi.fn();
const mockTouchLastUsed = vi.fn();
vi.mock("../../features/api-keys/api-key.service.js", () => ({
  verifyApiKey: (...args: unknown[]) => mockVerifyApiKey(...args),
  touchLastUsed: (...args: unknown[]) => mockTouchLastUsed(...args),
}));

vi.mock("../../lib/security/originMatcher.js", () => ({
  enforceOrigin: () => ({ allowed: true }),
}));

const mockCreateConversation = vi.fn();
const mockGetConversationWithParticipants = vi.fn();
const mockGetMessageHistory = vi.fn();
const mockSendMessage = vi.fn();
const mockEditMessage = vi.fn();
const mockDeleteMessage = vi.fn();
const mockMarkAsRead = vi.fn();
const mockGetUnreadCountForVisitor = vi.fn();
const mockListConversationsForVisitor = vi.fn();
const mockIsParticipant = vi.fn();

vi.mock("../../features/chat/chat.service.js", () => ({
  createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  getConversationWithParticipants: (...args: unknown[]) =>
    mockGetConversationWithParticipants(...args),
  getMessageHistory: (...args: unknown[]) => mockGetMessageHistory(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  editMessage: (...args: unknown[]) => mockEditMessage(...args),
  deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
  getUnreadCountForVisitor: (...args: unknown[]) =>
    mockGetUnreadCountForVisitor(...args),
  listConversationsForVisitor: (...args: unknown[]) =>
    mockListConversationsForVisitor(...args),
  isParticipant: (...args: unknown[]) => mockIsParticipant(...args),
  MessageNotFoundError: class MessageNotFoundError extends Error {
    constructor(id: string) {
      super(`Message not found: ${id}`);
      this.name = "MessageNotFoundError";
    }
  },
  NotMessageSenderError: class NotMessageSenderError extends Error {
    constructor(id: string, userId: string) {
      super(`User ${userId} is not the sender of message ${id}`);
      this.name = "NotMessageSenderError";
    }
  },
  MessageEditWindowExpiredError: class MessageEditWindowExpiredError extends Error {
    public readonly createdAt: string;
    public readonly windowMinutes: number;
    constructor(id: string, createdAt: string, windowMinutes: number) {
      super(`Message ${id} expired`);
      this.name = "MessageEditWindowExpiredError";
      this.createdAt = createdAt;
      this.windowMinutes = windowMinutes;
    }
  },
  ConversationNotFoundError: class ConversationNotFoundError extends Error {
    constructor(id: string) {
      super(`Conversation not found: ${id}`);
      this.name = "ConversationNotFoundError";
    }
  },
  ConversationNotActiveError: class ConversationNotActiveError extends Error {
    constructor(id: string, status: string) {
      super(`Conversation ${id} is not active (status: ${status})`);
      this.name = "ConversationNotActiveError";
    }
  },
}));

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
vi.mock("../../db/index.js", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("../../db/schema/users.js", () => ({ user: { id: "id" } }));
vi.mock("../../db/schema/conversations.js", () => ({
  conversations: { id: "id", applicationId: "applicationId", organizationId: "organizationId" },
}));
vi.mock("../../db/schema/messages.js", () => ({
  messages: { id: "id", conversationId: "conversationId", senderId: "senderId", createdAt: "createdAt", deletedAt: "deletedAt" },
}));
vi.mock("../../db/schema/conversationParticipants.js", () => ({
  conversationParticipants: {},
}));

const mockResolveOrCreateVisitor = vi.fn();
vi.mock("../../features/chat/visitor.service.js", () => ({
  resolveOrCreateVisitor: (...args: unknown[]) =>
    mockResolveOrCreateVisitor(...args),
}));

vi.mock("../../features/chat/broadcasting.service.js", () => ({
  broadcastOrganizationEvent: vi.fn(),
  broadcastRoomEvent: vi.fn(),
  buildConversationNewEvent: vi.fn(),
  buildMessageNewEvent: vi.fn(),
  buildMessageEditedEvent: vi.fn(),
  buildMessageDeletedEvent: vi.fn(),
}));

vi.mock("../../lib/middleware/visitorRateLimit.js", () => ({
  createVisitorRateLimitMiddleware: () =>
    async (_c: any, next: () => Promise<void>) => next(),
  createVisitorWsRateLimiter: () => ({ check: () => ({ allowed: true }) }),
}));
vi.mock("../../lib/middleware/visitorRateLimitInstance.js", () => ({
  sharedVisitorRateLimiter: { check: () => ({ allowed: true }) },
}));
vi.mock("../../lib/planLimits.js", () => ({
  VISITOR_RATE_LIMITS: { perSecond: 10, perMinute: 60, perHour: 600 },
}));

function setupValidApiKey() {
  mockVerifyApiKey.mockResolvedValue({
    valid: true,
    application: {
      id: VALID_APP_ID,
      domain: "example.com",
      allowedOrigins: ["https://example.com"],
      organizationId: VALID_ORG_ID,
    },
    apiKey: { id: "key-1", environment: "live" as const },
  });
}

function validHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: "Bearer dk_live_abcdefghijklmnopqrstuvwxyz123456",
    "X-App-Id": VALID_APP_ID,
    "X-Visitor-Id": VALID_VISITOR_ID,
    Origin: "https://example.com",
    ...extra,
  };
}

const { publicApiRoute } = await import("../publicApi.js");

const app = new Hono().route("/v1/api", publicApiRoute);

describe("Public REST API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupValidApiKey();
    mockResolveOrCreateVisitor.mockResolvedValue(VALID_VISITOR_ID);
  });

  describe("Authentication", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await app.request("/v1/api/conversations", {
        method: "GET",
        headers: {
          "X-App-Id": VALID_APP_ID,
          "X-Visitor-Id": VALID_VISITOR_ID,
        },
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 when API key is invalid", async () => {
      mockVerifyApiKey.mockResolvedValue({ valid: false, reason: "invalid" });
      const res = await app.request("/v1/api/conversations", {
        method: "GET",
        headers: validHeaders(),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when X-Visitor-Id is missing", async () => {
      const headers = validHeaders();
      delete (headers as any)["X-Visitor-Id"];
      const res = await app.request("/v1/api/conversations", {
        method: "GET",
        headers,
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when X-Visitor-Id is not a valid UUID", async () => {
      const res = await app.request("/v1/api/conversations", {
        method: "GET",
        headers: validHeaders({ "X-Visitor-Id": "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /v1/api/ws-token", () => {
    it("returns a signed WebSocket token", async () => {
      const res = await app.request("/v1/api/ws-token", {
        method: "POST",
        headers: validHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.token).toContain(".");
    });
  });

  describe("POST /v1/api/conversations", () => {
    it("creates a conversation and returns it with participants", async () => {
      const fakeConversation = {
        id: CONVERSATION_ID,
        organizationId: VALID_ORG_ID,
        applicationId: VALID_APP_ID,
        status: "pending",
        subject: "Help me",
        createdAt: "2026-01-01T00:00:00Z",
      };
      mockCreateConversation.mockResolvedValue(fakeConversation);
      mockGetConversationWithParticipants.mockResolvedValue({
        ...fakeConversation,
        participants: [
          { userId: VALID_VISITOR_ID, role: "visitor" },
        ],
      });

      const res = await app.request("/v1/api/conversations", {
        method: "POST",
        headers: {
          ...validHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subject: "Help me" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.conversation.id).toBe(CONVERSATION_ID);
      expect(body.conversation.participants).toBeDefined();
    });
  });

  describe("GET /v1/api/conversations", () => {
    it("returns paginated conversations for the visitor", async () => {
      const fakeConversations = [
        { id: CONVERSATION_ID, status: "pending", subject: "Test" },
      ];

      mockListConversationsForVisitor.mockResolvedValue({
        conversations: fakeConversations,
        total: 1,
      });

      const res = await app.request("/v1/api/conversations?limit=10&offset=0", {
        method: "GET",
        headers: validHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(0);
    });
  });

  describe("GET /v1/api/conversations/:id", () => {
    it("returns 404 when conversation not found", async () => {
      mockGetConversationWithParticipants.mockResolvedValue(null);

      const res = await app.request(`/v1/api/conversations/${CONVERSATION_ID}`, {
        method: "GET",
        headers: validHeaders(),
      });
      expect(res.status).toBe(404);
    });

    it("returns conversation with participants when found and user is participant", async () => {

      const fakeConv = {
        id: CONVERSATION_ID,
        organizationId: VALID_ORG_ID,
        status: "pending",
        participants: [{ userId: VALID_VISITOR_ID, role: "visitor" }],
      };
      mockGetConversationWithParticipants.mockResolvedValue(fakeConv);
      mockIsParticipant.mockResolvedValue(true);

      const res = await app.request(`/v1/api/conversations/${CONVERSATION_ID}`, {
        method: "GET",
        headers: validHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation.id).toBe(CONVERSATION_ID);
    });

    it("returns 404 when visitor is not a participant", async () => {

      mockGetConversationWithParticipants.mockResolvedValue({
        id: CONVERSATION_ID,
        organizationId: VALID_ORG_ID,
        participants: [{ userId: "someone-else", role: "operator" }],
      });
      mockIsParticipant.mockResolvedValue(false);

      const res = await app.request(`/v1/api/conversations/${CONVERSATION_ID}`, {
        method: "GET",
        headers: validHeaders(),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /v1/api/conversations/:id/messages", () => {
    it("returns paginated messages", async () => {
      mockIsParticipant.mockResolvedValue(true);
      mockGetMessageHistory.mockResolvedValue([
        { id: MESSAGE_ID, content: "Hello", senderId: VALID_VISITOR_ID },
      ]);

      const res = await app.request(
        `/v1/api/conversations/${CONVERSATION_ID}/messages?limit=20&offset=0`,
        { method: "GET", headers: validHeaders() },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.messages).toHaveLength(1);
      expect(body.limit).toBe(20);
      expect(body.offset).toBe(0);
    });
  });

  describe("POST /v1/api/conversations/:id/messages", () => {
    it("sends a message and returns it", async () => {

      mockIsParticipant.mockResolvedValue(true);
      const fakeMessage = {
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        senderId: VALID_VISITOR_ID,
        content: "Hello!",
        createdAt: "2026-01-01T00:00:00Z",
      };
      mockSendMessage.mockResolvedValue(fakeMessage);

      const res = await app.request(
        `/v1/api/conversations/${CONVERSATION_ID}/messages`,
        {
          method: "POST",
          headers: { ...validHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Hello!" }),
        },
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message.id).toBe(MESSAGE_ID);
      expect(body.message.content).toBe("Hello!");
    });
  });

  describe("PATCH /v1/api/conversations/:id/messages/:messageId", () => {
    it("edits a message within the time window", async () => {

      mockIsParticipant.mockResolvedValue(true);
      const updatedMsg = {
        id: MESSAGE_ID,
        content: "Updated content",
        editedAt: "2026-01-01T00:01:00Z",
      };
      mockEditMessage.mockResolvedValue(updatedMsg);

      const res = await app.request(
        `/v1/api/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`,
        {
          method: "PATCH",
          headers: { ...validHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated content" }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message.content).toBe("Updated content");
    });

    it("returns 422 when edit window has expired", async () => {

      mockIsParticipant.mockResolvedValue(true);

      const { MessageEditWindowExpiredError } = await import(
        "../../features/chat/chat.service.js"
      );
      mockEditMessage.mockRejectedValue(
        new MessageEditWindowExpiredError(MESSAGE_ID, "2026-01-01T00:00:00Z", 15),
      );

      const res = await app.request(
        `/v1/api/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`,
        {
          method: "PATCH",
          headers: { ...validHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Too late" }),
        },
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toContain("expired");
    });
  });

  describe("DELETE /v1/api/conversations/:id/messages/:messageId", () => {
    it("soft-deletes a message within the time window", async () => {

      mockIsParticipant.mockResolvedValue(true);
      mockDeleteMessage.mockResolvedValue({ id: MESSAGE_ID, deletedAt: "2026-01-01T00:01:00Z" });

      const res = await app.request(
        `/v1/api/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`,
        { method: "DELETE", headers: validHeaders() },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("POST /v1/api/conversations/:id/read", () => {
    it("marks conversation as read for the visitor", async () => {

      mockIsParticipant.mockResolvedValue(true);
      mockMarkAsRead.mockResolvedValue({ lastReadMessageId: MESSAGE_ID });

      const res = await app.request(
        `/v1/api/conversations/${CONVERSATION_ID}/read`,
        {
          method: "POST",
          headers: { ...validHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: MESSAGE_ID }),
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("GET /v1/api/conversations/:id/unread", () => {
    it("returns unread count for the visitor", async () => {

      mockIsParticipant.mockResolvedValue(true);
      mockGetUnreadCountForVisitor.mockResolvedValue(5);

      const res = await app.request(
        `/v1/api/conversations/${CONVERSATION_ID}/unread`,
        { method: "GET", headers: validHeaders() },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unreadCount).toBe(5);
    });
  });
});
